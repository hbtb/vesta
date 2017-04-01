import * as fs from "fs-extra";
import * as path from "path";
import * as _ from "lodash";
import {Question} from "inquirer";
import {ClassGen} from "../../../core/ClassGen";
import {TsFileGen} from "../../../core/TSFileGen";
import {Util} from "../../../../util/Util";
import {CordovaGen} from "../../../file/CordovaGen";
import {Vesta} from "../../../file/Vesta";
import {ClientAppGen} from "../../../app/client/ClientAppGen";
import {FsUtil} from "../../../../util/FsUtil";
import {Placeholder} from "../../../core/Placeholder";


export interface INGInjectable {
    name?: string;
    type?: string;
    path?: string;
    isLib?: boolean;
    importType?: number;
    plugins?: Array<string>;
}

export class NGDependencyInjector {
    public static preInitiatedServices = ['apiService', 'formService', 'notificationService', 'logService', 'authService', 'Setting'];

    public static getServices(): Array<INGInjectable> {
        let fetchPlugins = Vesta.getInstance().getConfig().client.platform == ClientAppGen.Platform.Cordova,
            serviceDirectory = 'src/app/service',
            services: Array<INGInjectable> = [];
        try {
            let serviceFiles = fs.readdirSync(serviceDirectory);
            for (let i = 0; i < serviceFiles.length; i++) {
                let serviceFile = serviceFiles[i];
                if (!/\.ts$/.exec(serviceFile)) continue;
                let className = serviceFile.substr(0, serviceFile.length - 3);
                services.push({
                    name: className,
                    path: path.join(serviceDirectory, serviceFile),
                    type: className,
                    plugins: fetchPlugins ? CordovaGen.getPlugins(className) : []
                });
            }
        } catch (e) {
            console.error(e);
        }
        return services;
    }

    /**
     This function will create import statement only if an injectable sets the `path` in INGInjectable
     */
    public static inject(file: TsFileGen, injects: Array<INGInjectable>, destination: string, ignoreDependencies: boolean = false) {
        let staticInject = '',
            theClass = file.getClass(file.name),
            cm = theClass.getConstructor(),
            injecteds = [],
            plugins = [];
        for (let i = 0, il = injects.length; i < il; ++i) {
            if (injecteds.indexOf(injects[i].name) >= 0) continue;
            injecteds.push(injects[i].name);
            let instanceName, importPath, injectable = injects[i];
            if (injectable.isLib) {
                instanceName = injectable.name;
                importPath = injectable.path;
            } else {
                instanceName = _.camelCase(injectable.name);
                importPath = injectable.path ? Util.genRelativePath(destination, injectable.path) : '';
            }
            cm.addParameter({name: instanceName, type: injectable.type, access: ClassGen.Access.Private});
            if (importPath) {
                let imp = injectable.importType == TsFileGen.ImportType.Namespace ? injectable.type : `{${injectable.type}}`;
                file.addImport(imp, importPath, injectable.importType || TsFileGen.ImportType.Module);
            }
            staticInject += (staticInject ? ', ' : '' ) + `'${instanceName}'`;
            if (injectable.plugins && injectable.plugins.length) {
                plugins = plugins.concat(injectable.plugins);
            }
        }
        theClass.addProperty({
            name: '$inject',
            access: ClassGen.Access.Public,
            defaultValue: `[${staticInject}]`,
            isStatic: true
        });
        //if (plugins.length && !ignoreDependencies) {
        //    vesta.cordovaExec(['plugin', 'add'].concat(plugins));
        //}
    }

    public static updateImportFile(file: TsFileGen, type: string, destination: string, placeHolder: string, importPath: string) {
        let className = file.name,
            instanceName = _.camelCase(className),
            importFilePath = 'src/app/config/import.ts';
        if (/.+Filter$/.exec(instanceName)) {
            instanceName = instanceName.replace(/Filter$/, '');
        }
        // creating the ts file and write it's content
        FsUtil.writeFile(path.join(destination, className + '.ts'), file.generate());

        let importFileCode = fs.readFileSync(importFilePath, {encoding: 'utf8'}),
            // import statement code
            importCode = `import {${className}} from "${importPath}/${className}";`,
            // adding module as property to exporter variable code
            embedCode = `${instanceName}: ${className},`;

        if (importFileCode.indexOf(importCode) < 0) {
            importCode += `\n${Placeholder.Import}`;
            importFileCode = importFileCode.replace(Placeholder.Import, importCode);
        }
        if (importFileCode.indexOf(embedCode) < 0) {
            embedCode += `\n        ${placeHolder}`;
            importFileCode = importFileCode.replace(placeHolder, embedCode);
        }
        FsUtil.writeFile(importFilePath, importFileCode);
    }

    public static getCliInjectables(extraInjectables: Array<INGInjectable> = []): Promise<Array<INGInjectable>> {
        let injectables: Array<INGInjectable> = [<INGInjectable>{
                name: '$rootScope',
                type: 'IExtRootScopeService',
                path: 'src/app/ClientApp'
            }].concat(extraInjectables, NGDependencyInjector.getServices()),
            injectableNames = [];
        for (let i = 0, il = injectables.length; i < il; ++i) {
            if (NGDependencyInjector.preInitiatedServices.indexOf(injectables[i].name) == -1) {
                injectableNames.push(injectables[i].name);
            }
        }
        return new Promise(resolve => {
            Util.prompt<{injects: Array<string>}>(<Question>{
                name: 'injects',
                type: 'checkbox',
                message: 'Injectables: ',
                choices: injectableNames
            }).then(answer => {
                let selected: Array<INGInjectable> = [];
                for (let i = answer['injects'].length; i--;) {
                    for (let j = injectables.length; j--;) {
                        if (answer['injects'][i] == injectables[j].name) {
                            selected.push(injectables[j]);
                        }
                    }
                }
                resolve(selected);
            });
        })
    }
}
