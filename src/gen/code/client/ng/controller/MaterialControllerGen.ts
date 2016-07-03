import * as _ from "lodash";
import {Util} from "../../../../../util/Util";
import {ModelGen} from "../../../ModelGen";
import {BaseNGControllerGen} from "./BaseNGControllerGen";
import {ClassGen} from "../../../../core/ClassGen";
import {MaterialListGen} from "./../list/MaterialListGen";
import {TsFileGen} from "../../../../core/TSFileGen";

export class MaterialControllerGen extends BaseNGControllerGen {

    protected setModelRequiredInjections() {
        super.setModelRequiredInjections();
        // todo Only if the form is displayed in modal -> this should be injected
        this.addInjection({
            name: '$mdDialog',
            type: 'IDialogService',
            path: 'angular.material.IDialogService',
            isLib: true,
            importType: TsFileGen.ImportType.Namespace
        });
    }

    public setAsListController() {
        this.setModelRequiredInjections();
        let modelName = ModelGen.extractModelName(this.config.model);
        let ctrlName = _.camelCase(this.config.name),
            capitalize = _.capitalize(ctrlName),
            modelInstanceName = _.camelCase(modelName),
            modelPlural = Util.plural(_.camelCase(modelName)),
            url = (this.config.module ? (this.config.module + '/') : '') + ctrlName + '/',
            edge = Util.joinPath(this.config.module, ctrlName),
            modelListName = `${modelPlural}List`,
            modelSelectedListName = `selected${_.capitalize(modelPlural)}List`;
        this.controllerFile.addImport(`{IQueryRequest, IQueryResult, IDeleteResult}`, 'vesta-schema/ICRUDResult');
        this.controllerFile.addImport(`{ExtArray}`, 'vesta-util/ExtArray');
        this.controllerClass.addProperty({
            name: modelListName,
            type: `ExtArray<I${modelName}>`,
            access: ClassGen.Access.Private,
            defaultValue: `new ExtArray<I${modelName}>()`
        });
        this.controllerClass.addProperty({
            name: modelSelectedListName,
            type: `Array<number>`,
            access: ClassGen.Access.Private,
            defaultValue: `[]`
        });
        this.controllerClass.addProperty({name: 'dtOption', type: `any`, access: ClassGen.Access.Private});
        this.controllerClass.addProperty({
            name: 'currentPage',
            type: `number`,
            access: ClassGen.Access.Private,
            defaultValue: '1'
        });
        this.controllerClass.addProperty({
            name: 'busy',
            type: `boolean`,
            access: ClassGen.Access.Private,
            defaultValue: 'false'
        });
        this.controllerClass.getConstructor().appendContent(`this.dtOption = {
            showFilter: false,
            title: 'List of ${modelPlural}',
            filter: '',
            order: '',
            rowsPerPage: [10, 20, 50],
            limit: 10,
            page: 1,
            total: 0,
            label: {text: 'Records', of: 'of'},
            loadMore: this.loadMore.bind(this)
        };
        this.acl = authService.getActionsOn('${modelInstanceName}');
        apiService.get<IQueryRequest<I${modelName}>, IQueryResult<I${modelName}>>('${edge}')
            .then(result=> {
                if (result.error) return this.notificationService.toast(result.error.message);
                this.${modelListName}.set(result.items);
                this.dtOption.total = result.total;
            })`);
        this.controllerFile.addImport('IDialogOptions', 'angular.material.IDialogOptions', TsFileGen.ImportType.Namespace);
        // loadMore
        let loadMoreMethod = this.controllerClass.addMethod('loadMore');
        loadMoreMethod.addParameter({name: 'page', type: 'number'});
        loadMoreMethod.setContent(`if(this.busy || page <= this.currentPage) return;
        this.busy = true;
        this.apiService.get<IQueryRequest<I${modelName}>, IQueryResult<I${modelName}>>('${edge}', {
                limit: 10,
                page: ++this.currentPage
            })
            .then(result=> {
                if (result.error) return this.notificationService.toast(result.error.message);
                for(let i = 0; i < result.items.length; i++){
                    this.${modelListName}.push(result.items[i]);
                }
                this.dtOption.total = result.total;
                this.busy = false;
            })`);
        // add method
        let addMethod = this.controllerClass.addMethod(`add${modelName}`);
        addMethod.addParameter({name: 'event', type: 'MouseEvent'});
        addMethod.setContent(`this.$mdDialog.show(<IDialogOptions>{
            controller: '${ctrlName}AddController',
            controllerAs: 'vm',
            templateUrl: 'tpl/${url}${ctrlName}AddForm.html',
            parent: angular.element(document.body),
            targetEvent: event
        }).then((${modelInstanceName}) => {
            this.${modelPlural}List.push(${modelInstanceName});
            this.notificationService.toast('New ${modelInstanceName} has been added successfully');
        }).catch(err=> err && this.notificationService.toast(err.message))`);
        // edit method
        let editMethod = this.controllerClass.addMethod(`edit${modelName}`);
        editMethod.addParameter({name: 'event', type: 'MouseEvent'});
        editMethod.addParameter({name: 'id', type: 'number'});
        editMethod.setContent(`event.stopPropagation();
        this.$mdDialog.show(<IDialogOptions>{
            controller: '${ctrlName}EditController',
            controllerAs: 'vm',
            templateUrl: 'tpl/${url}${ctrlName}EditForm.html',
            parent: angular.element(document.body),
            targetEvent: event,
            locals: {
                id: id
            }
        }).then((${modelInstanceName}: I${modelName}) => {
            this.${modelListName}[this.${modelListName}.indexOfByProperty('id', ${modelInstanceName}.id)] = ${modelInstanceName};
            this.notificationService.toast('${modelInstanceName} has been updated successfully');
        }).catch(err=> err && this.notificationService.toast(err.message))`);
        // delete method
        let delMethod = this.controllerClass.addMethod(`del${modelName}`);
        delMethod.addParameter({name: 'event', type: 'MouseEvent'});
        delMethod.setContent(`let confirm = this.$mdDialog.confirm()
            .parent(angular.element(document.body))
            .title('Delete confirmation')
            .textContent('Are you sure about deleting the select ${modelInstanceName}')
            .targetEvent(event)
            .ok('Yes').cancel('No');
        this.$mdDialog.show(confirm).then(() => {
            this.apiService.delete<Array<number>, IDeleteResult>('${edge}', this.${modelSelectedListName})
                .then(result=> {
                    if (result.error) return this.notificationService.toast(result.error.message);
                    this.${modelListName}.removeByProperty('id', this.${modelSelectedListName});
                    this.${modelSelectedListName} = [];
                    this.notificationService.toast(result.items.length + ' ${modelInstanceName} has been deleted successfully');
                })
        })`);
        // template
        let template = new MaterialListGen(this.config);
        template.generate();
    }

    public setAsAddController() {
        this.isSpecialController = true;
        let ctrlName = _.camelCase(this.config.name),
            modelName = ModelGen.extractModelName(this.config.model),
            modelInstanceName = _.camelCase(modelName),
            formName = `${modelInstanceName}Form`,
            edge = Util.joinPath(this.config.module, ctrlName);
        this.controllerFile.name = _.capitalize(ctrlName) + 'AddController';
        this.controllerClass.name = this.controllerFile.name;
        this.controllerClass.addProperty({name: formName, type: 'IFormController', access: ClassGen.Access.Private});
        this.controllerFile.addImport(`{IUpsertResult}`, 'vesta-schema/ICRUDResult');
        this.controllerFile.addImport('{IFormController}', 'angular');
        this.controllerClass.getConstructor().appendContent(`this.${modelInstanceName} = new ${modelName}();`);
        let closeMethod = this.controllerClass.addMethod('closeFormModal');
        closeMethod.setContent('this.$mdDialog.cancel();');
        this.setModelRequiredInjections();
        let addMethod = this.controllerClass.addMethod(`add${modelName}`);
        let fileExtractionCode = '';
        let fileUploadCode = '';
        if (this.fileTypesFields) {
            let fileNames = Object.keys(this.fileTypesFields);
            if (fileNames.length == 1) {
                fileExtractionCode = `
        let files:IFileKeyValue = null;
        if (${modelInstanceName}.${fileNames[0]}) {
            files = {fileFieldsName[0]: <File>${modelInstanceName}.${fileNames[0]}};
        }`;
                fileUploadCode = `
                if (files) return this.upload(\`${edge}/file/\${this.${modelInstanceName}.id}\`, files);`;
            } else {
                fileExtractionCode = `
        let files:IFileKeyValue = {};`;
                for (let i = 0, il = fileNames.length; i < il; ++i) {
                    fileExtractionCode+=`
        if (${modelInstanceName}.${fileNames[i]}) files['${fileNames[i]}'] = <File>${modelInstanceName}.${fileNames[i]};`
                }
                fileUploadCode = `
                if (Object.keys(files).length) return this.upload(\`${edge}/file/\${this.${modelInstanceName}.id}\`, files);`;
            }
        }
        addMethod.setContent(`let validate = this.formService.evaluate(this.${modelInstanceName}.validate(), this.${formName});
        if (!validate) return this.notificationService.toast('Invalid form data');
        let ${modelInstanceName} = this.${modelInstanceName}.getValues<I${modelName}>();${fileExtractionCode}
        this.apiService.post<I${modelName}, IUpsertResult<I${modelName}>>('${edge}', ${modelInstanceName})
            .then(result=> {
                if (result.error) throw result.error;
                this.${modelInstanceName}.id = result.items[0].id;${fileUploadCode}
            })
            .then(()=> this.$mdDialog.hide(this.${modelInstanceName}))
            .catch(err=> {
                this.notificationService.toast(err.message);
                if (err.code == Err.Code.Validation) {
                    this.formService.evaluate((<ValidationError>err).violations, this.${formName});
                }
            });`);
    }

    public setAsEditController() {
        this.isSpecialController = true;
        let ctrlName = _.camelCase(this.config.name),
            modelName = ModelGen.extractModelName(this.config.model),
            modelInstanceName = _.camelCase(modelName),
            formName = `${modelInstanceName}Form`,
            edge = Util.joinPath(this.config.module, ctrlName);
        this.controllerFile.name = _.capitalize(ctrlName) + 'EditController';
        this.controllerClass.name = this.controllerFile.name;
        this.controllerClass.addProperty({name: formName, type: 'IFormController', access: ClassGen.Access.Private});
        this.controllerFile.addImport(`{IQueryRequest, IQueryResult, IUpsertResult}`, 'vesta-schema/ICRUDResult');
        this.controllerFile.addImport('{IFormController}', 'angular');
        this.addInjection({name: 'locals', type: 'any', path: '', isLib: true});
        this.controllerClass.getConstructor().appendContent(`apiService.get<IQueryRequest<I${modelName}>, IQueryResult<I${modelName}>>('${edge}/'+this.locals.id)
            .then(result=> {
                if (result.error) return $mdDialog.cancel(result.error);
                this.${modelInstanceName} = new ${modelName}(result.items[0]);
            })
            .catch(reason=>$mdDialog.cancel(reason));
        `);
        let closeMethod = this.controllerClass.addMethod('closeFormModal');
        closeMethod.setContent('this.$mdDialog.cancel();');
        this.setModelRequiredInjections();
        let updateMethod = this.controllerClass.addMethod(`edit${modelName}`);
        let fileExtractionCode = '';
        let fileUploadCode = '';
        if (this.fileTypesFields) {
            let fileNames = Object.keys(this.fileTypesFields);
            if (fileNames.length == 1) {
                fileExtractionCode = `
        let files:IFileKeyValue = null;
        if (${modelInstanceName}.${fileNames[0]}) {
            files = {fileFieldsName[0]: <File>${modelInstanceName}.${fileNames[0]}};
        }`;
                fileUploadCode = `
                if (files) return this.upload(\`${edge}/file/\${this.${modelInstanceName}.id}\`, files);`;
            } else {
                fileExtractionCode = `
        let files:IFileKeyValue = {};`;
                for (let i = 0, il = fileNames.length; i < il; ++i) {
                    fileExtractionCode+=`
        if (${modelInstanceName}.${fileNames[i]} && 'string' !== typeof ${modelInstanceName}.${fileNames[i]}) files['${fileNames[i]}'] = <File>${modelInstanceName}.${fileNames[i]};`
                }
                fileUploadCode = `
                if (Object.keys(files).length) return this.upload(\`${edge}/file/\${this.${modelInstanceName}.id}\`, files);`;
            }
        }
        updateMethod.setContent(`if (!this.${formName}.$dirty) return this.notificationService.toast('Nothing changed');
        let validate = this.formService.evaluate(this.${modelInstanceName}.validate(), this.${formName});
        if (!validate) return this.notificationService.toast('Invalid form data');
        let ${modelInstanceName} = this.${modelInstanceName}.getValues<I${modelName}>();${fileExtractionCode}
        this.apiService.put<I${modelName}, IUpsertResult<I${modelName}>>('${edge}', ${modelInstanceName})
            .then(result=> {
                if (result.error) throw result.error;
                this.${modelInstanceName}.id = result.items[0].id;${fileUploadCode}
            })
            .then(()=> this.$mdDialog.hide(this.${modelInstanceName}))
            .catch(err=> {
                this.notificationService.toast(err.message);
                if (err.code == Err.Code.Validation) {
                    this.formService.evaluate((<ValidationError>err).violations, this.${modelInstanceName}Form);
                }
            });`);
    }
}