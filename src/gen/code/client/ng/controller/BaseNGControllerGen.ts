import * as fs from "fs-extra";
import * as path from "path";
import * as _ from "lodash";
import {INGControllerConfig, NGControllerGen, ControllerType} from "../NGControllerGen";
import {TsFileGen} from "../../../../core/TSFileGen";
import {ClassGen} from "../../../../core/ClassGen";
import {NGFormGen, INGFormWrapperConfig} from "../NGFormGen";
import {INGInjectable, NGDependencyInjector} from "../NGDependencyInjector";
import {Util} from "../../../../../util/Util";
import {Placeholder} from "../../../../core/Placeholder";
import {XMLGen} from "../../../../core/XMLGen";
import {SassGen} from "../../../../file/SassGen";
import {FsUtil} from "../../../../../util/FsUtil";
import {ModelGen} from "../../../ModelGen";
import {Model, IModelFields} from "vesta-schema/Model";
import {FieldType} from "vesta-schema/Field";

/**
 * @property {boolean} isSpecialController If true, the controller is of type addController or editController
 */
export abstract class BaseNGControllerGen {
    protected controllerFile:TsFileGen;
    protected controllerClass:ClassGen;
    protected path:string = 'src/app/modules';
    protected templatePath:string = 'src/app/templates';
    protected form:NGFormGen;
    protected hasScope:boolean = false;
    protected isSpecialController:boolean = false;
    protected fileTypesFields:IModelFields = null;
    protected model:Model;
    protected immutableConfig:INGControllerConfig;

    constructor(protected config:INGControllerConfig) {
        this.immutableConfig = JSON.parse(JSON.stringify(this.config));
        if (/.+controller$/i.exec(config.name)) {
            config.name = config.name.replace(/controller$/i, '');
        }
        let ctrlName = _.camelCase(config.name);
        let ctrlClassName = `${ctrlName}Controller`;
        this.path = path.join(this.path, config.module);
        this.controllerFile = new TsFileGen(_.capitalize(ctrlClassName));
        this.controllerClass = this.controllerFile.addClass();
        this.controllerClass.setParentClass('BaseController');
        this.controllerClass.setConstructor().setContent(`super();`);
        this.templatePath = path.join(this.templatePath, config.module);
        // importing authService for acl (no path property is provided since it has been imported by ACL)
        this.addInjection({name: 'authService', type: 'AuthService'});
        if (config.model) {
            this.fileTypesFields = ModelGen.getFieldsByType(config.model, FieldType.File);
            this.form = new NGFormGen(config);
            this.path = path.join(this.path, ctrlName);
            this.templatePath = path.join(this.templatePath, ctrlName);
        }
        this.addAclMethod();
        this.controllerFile.addImport('{BaseController}', Util.genRelativePath(this.path, `src/app/modules/BaseController`));
        FsUtil.mkdir(this.path, this.templatePath);
        for (let i = config.injects.length; i--;) {
            if (config.injects[i].name == '$scope') {
                config.injects.splice(i, 1);
                this.hasScope = true;
                break;
            }
        }
    }

    protected addAclMethod() {
        // importing AuthService
        this.controllerFile.addImport('{AuthService, IAclActions}', Util.genRelativePath(this.path, `src/app/service/AuthService`));
        // adding acl property
        this.controllerClass.addProperty({
            name: 'acl',
            type: `IAclActions`,
            access: ClassGen.Access.Public
        });
        // generating registerPermissions
        let aclMethod = this.controllerClass.addMethod('registerPermissions', ClassGen.Access.Public, true);
        let stateName = (this.config.module ? `${this.config.module}.` : ``) + _.camelCase(this.config.name);
        // this will assume that the state name from the client side is the same as edge name from server side
        switch (this.config.type) {
            case ControllerType.List:
                aclMethod.setContent(`AuthService.registerPermissions('${stateName}', {'${stateName}': ['read']});`);
                break;
            case ControllerType.Add:
                aclMethod.setContent(`AuthService.registerPermissions('${stateName}', {'${stateName}': ['read', 'add']});`);
                break;
            case ControllerType.Edit:
                aclMethod.setContent(`AuthService.registerPermissions('${stateName}', {'${stateName}': ['read', 'update']});`);
                break;
        }

    }

    /**
     * add the INGInjectable param to the this.config.injects
     * @param inject
     */
    protected addInjection(inject:INGInjectable) {
        for (let i = this.config.injects.length; i--;) {
            if (this.config.injects[i].name == inject.name) return;
        }
        this.config.injects.push(inject);
    }

    protected setModelRequiredInjections() {
        // importing model
        let modelName = ModelGen.extractModelName(this.config.model);
        this.controllerClass.addProperty({
            name: _.camelCase(modelName),
            type: modelName,
            access: ClassGen.Access.Private
        });
        this.controllerFile.addImport(`{I${modelName}, ${modelName}}`, Util.genRelativePath(this.path, `src/app/cmn/models/${this.config.model}`));
        let hasFileUpsert = false;
        if (this.config.type != ControllerType.List) {
            // importing Err
            this.controllerFile.addImport('{Err}', 'vesta-util/Err');
            this.controllerFile.addImport('{ValidationError}', 'vesta-schema/error/ValidationError');
            if (this.fileTypesFields) {
                hasFileUpsert = true;
                this.controllerFile.addImport('{ApiService, IFileKeyValue}', Util.genRelativePath(this.path, `src/app/service/ApiService`));
            }
        }
        // importing apiService
        this.addInjection({
            name: 'apiService',
            type: 'ApiService',
            path: hasFileUpsert ? '' : 'src/app/service/ApiService'
        });
        // importing formService
        this.addInjection({name: 'formService', type: 'FormService', path: 'src/app/service/FormService'});
        // importing notificationService
        this.addInjection({
            name: 'notificationService', type: 'NotificationService', path: 'src/app/service/NotificationService'
        });
    }

    protected getTemplatePath() {
        let ctrlName = _.camelCase(this.config.name),
            pathParts = ['tpl'];
        if (this.config.module) {
            pathParts.push(this.config.module);
        }
        if (this.config.model) {
            pathParts.push(ctrlName);
        }
        return pathParts.join('/');
    }

    protected generateRoute() {
        let ctrlName = _.camelCase(this.config.name),
            stateNameParts = [],
            viewName = 'master';
        if (this.config.module) {
            stateNameParts.push(this.config.module);
            viewName = [`${_.kebabCase(this.config.module)}-content`, this.config.module].join('@');
        }
        stateNameParts.push(ctrlName);
        let url = ctrlName,
            state = stateNameParts.join('.'),
            templateUrl = `${this.getTemplatePath()}/${ctrlName}.html`;
        let codeFirstLine = `$stateProvider.state('${state}', {`;
        if (Util.fileHasContent('src/app/config/route.ts', codeFirstLine)) return;
        let code = `${codeFirstLine}
        url: '/${url}',
        views: {
            '${viewName}': {
                templateUrl: '${templateUrl}',
                controller: '${ctrlName}Controller',
                controllerAs: 'vm'
            }
        }
    });\n    ${Placeholder.NGRouter}`;
        let routerFile = 'src/app/config/route.ts';
        let routeCode = fs.readFileSync(routerFile, {encoding: 'utf8'});
        FsUtil.writeFile(routerFile, routeCode.replace(Placeholder.NGRouter, code));
    }

    protected generateForm() {
        let ctrlName = _.camelCase(this.config.name),
            formName = `${ctrlName}Form`,
            includePath = Util.joinPath('tpl', this.config.module, ctrlName),
            config:INGFormWrapperConfig = <INGFormWrapperConfig>{};
        config.formPath = Util.joinPath(includePath, `${formName}.html`);
        FsUtil.writeFile(path.join(this.templatePath, `${ctrlName}Form.html`), this.form.generate());
        config.isModal = true;
        config.type = NGFormGen.Type.Add;
        config.title = `Add ${this.config.model}`;
        config.cancel = 'Cancel';
        config.ok = 'Save';
        let addForm = this.form.wrap(config);
        FsUtil.writeFile(path.join(this.templatePath, `${ctrlName}AddForm.html`), addForm.generate());
        config.type = NGFormGen.Type.Edit;
        config.title = `Edit ${this.config.model}`;
        let editForm = this.form.wrap(config);
        FsUtil.writeFile(path.join(this.templatePath, `${ctrlName}EditForm.html`), editForm.generate());
        //
        let addControllerConfig = JSON.parse(JSON.stringify(this.immutableConfig));
        addControllerConfig.type = ControllerType.Add;
        let addController = new NGControllerGen(addControllerConfig);
        addController.setAsAddController();
        addController.generate();
        //
        let editControllerConfig = JSON.parse(JSON.stringify(this.immutableConfig));
        editControllerConfig.type = ControllerType.Edit;
        let editController = new NGControllerGen(editControllerConfig);
        editController.setAsEditController();
        editController.generate();
    }

    public abstract setAsListController();

    public abstract setAsAddController();

    public abstract setAsEditController();

    protected createPageTemplate() {
        let template = new XMLGen('div'),
            pageName = _.camelCase(this.config.name);
        let list = this.config.model ? `\n    <div ng-include="'${this.getTemplatePath()}/${_.camelCase(this.config.name)}List.html'"></div>` : '';
        template.setAttribute('id', `${pageName}-page`).addClass('page');
        pageName = _.capitalize(_.camelCase(this.config.name));
        template.html(`<h1>${pageName} Page</h1>${list}`);
        let sass = new SassGen(this.config.name, SassGen.Type.Page);
        sass.generate();
        FsUtil.writeFile(path.join(this.templatePath, _.camelCase(this.config.name) + '.html'), template.generate());
    }

    protected createScope() {
        let name = _.capitalize(_.camelCase(this.config.name));
        let scopeInterface = this.controllerFile.addInterface(`I${name}Scope`);
        scopeInterface.setParentClass('IScope');
        this.controllerFile.addImport('{IScope}', 'angular');
        this.addInjection({name: '$scope', type: scopeInterface.name, path: '', isLib: true});
    }

    public generate() {
        if (this.hasScope) {
            this.createScope();
        }
        if (this.config.model && !this.isSpecialController) {
            this.generateForm();
            this.setAsListController();
        } else {
            this.createPageTemplate();
        }
        NGDependencyInjector.inject(this.controllerFile, this.config.injects, this.path, this.isSpecialController);
        this.generateRoute();
        NGDependencyInjector.updateImportFile(this.controllerFile, 'controller', this.path, Placeholder.NGController, Util.genRelativePath('src/app/config', this.path));
    }
}