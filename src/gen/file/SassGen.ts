import * as _ from "lodash";
import * as fs from "fs-extra";
import * as path from "path";
import {Util} from "../../util/Util";
import {Placeholder} from "../core/Placeholder";
import {FsUtil} from "../../util/FsUtil";

export class SassGen {
    static Type = {Font: 'font', Component: 'component', Directive: 'directive', Page: 'page'};
    private basePath = 'src/scss';

    constructor(public name: string, public type: string = SassGen.Type.Page) {

    }

    private genFontSass() {
        let code = `@font-face {
  font-family: '${this.name}';
  src: url('#{$font-path}/${this.name}.eot?#iefix') format('embedded-opentype'),
  url('#{$font-path}/${this.name}.woff') format('woff'),
  url('#{$font-path}/${this.name}.ttf') format('truetype'),
  url('#{$font-path}/${this.name}.svg#${this.name}') format('svg');
  font-weight: normal;
  font-style: normal;
}
`;
        this.name = _.camelCase(this.name);
        let dir = path.join(this.basePath, 'fonts'),
            pattern = {};
        try {
            fs.mkdirpSync(dir);
        } catch (e) {
        }
        FsUtil.writeFile(path.join(dir, `_${this.name}.scss`), code);
        pattern[Placeholder.SassFont] = `@import 'fonts/${this.name}';\n${Placeholder.SassFont}`;
        Util.findInFileAndReplace(path.join(this.basePath, '_common.scss'), pattern, true);
    }

    private genPageSass() {
        let code = `#${this.name}-page {
}
`;
        let dir = path.join(this.basePath, 'pages'),
            pattern = {};
        try {
            fs.mkdirpSync(dir);
        } catch (e) {
        }
        FsUtil.writeFile(path.join(dir, `_${this.name}.scss`), code);
        pattern[Placeholder.SassPage] = `@import 'pages/${this.name}';\n${Placeholder.SassPage}`;
        Util.findInFileAndReplace(path.join(this.basePath, '_common.scss'), pattern, true);
    }

    private genComponentSass() {
        let code = `.${this.name} {
}
`;
        let dir = path.join(this.basePath, 'components'),
            pattern = {};
        try {
            fs.mkdirpSync(dir);
        } catch (e) {
        }
        FsUtil.writeFile(path.join(dir, `_${this.name}.scss`), code);
        pattern[Placeholder.SassComponent] = `@import 'components/${this.name}';\n${Placeholder.SassComponent}`;
        Util.findInFileAndReplace(path.join(this.basePath, '_common.scss'), pattern, true);
    }

    private genDirectiveSass() {
        let code = `.${this.name} {
}
`;
        let dir = path.join(this.basePath, 'directives'),
            pattern = {};
        try {
            fs.mkdirpSync(dir);
        } catch (e) {
        }
        FsUtil.writeFile(path.join(dir, `_${this.name}.scss`), code);
        pattern[Placeholder.SassDirective] = `@import 'directives/${this.name}';\n${Placeholder.SassDirective}`;
        Util.findInFileAndReplace(path.join(this.basePath, '_common.scss'), pattern, true);
    }

    public generate() {
        switch (this.type) {
            case SassGen.Type.Font:
                this.genFontSass();
                break;
            case SassGen.Type.Component:
                this.genComponentSass();
                break;
            case SassGen.Type.Directive:
                this.genDirectiveSass();
                break;
            case SassGen.Type.Page:
                this.genPageSass();
                break;
        }
    }
}