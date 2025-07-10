module.exports = function (plop) {
    plop.setGenerator('create-tool', {
        description: 'Generate a TypeScript class and its test',
        prompts: [
            {
                type: 'input',
                name: 'name',
                message: 'Tool class name without suffix using PascalCase e.g. Search:',
            },            
            {
                type: 'input',
                name: 'toolName',
                message: 'Tool name property in snake_case. Must end with _tool e.g. search_tool:',
            },
        ],
        actions: [
            {
                type: 'add',
                path: 'src/tools/{{kebabCase name}}-tool/{{pascalCase name}}Tool.ts',
                templateFile: 'plop-templates/tool.hbs',
            },
            {
                type: 'add',
                path: 'src/tools/{{kebabCase name}}-tool/{{pascalCase name}}Tool.test.ts',
                templateFile: 'plop-templates/tool.test.hbs',
            },
            {
                type: 'append',
                path: 'src/tools/toolRegistry.ts',
                pattern: /(\/\/ INSERT NEW TOOL IMPORT HERE)/,
                template: "import { {{pascalCase name}}Tool } from './{{kebabCase name}}-tool/{{pascalCase name}}Tool.js';",
            },
            {
                type: 'append',
                path: 'src/tools/toolRegistry.ts',
                pattern: /(\/\/ INSERT NEW TOOL INSTANCE HERE)/,
                template: '  new {{pascalCase name}}Tool(),',
            },
            {
                type: 'append',
                path: 'README.md',
                pattern: /(### Mapbox API tools)/,
                template: '\n\n#### {{titleCase name}} tool\n\nDescription goes here...\nUses the *Link to Mapbox API documentation here*',
            },
        ],
    });
};