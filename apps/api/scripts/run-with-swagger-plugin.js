/**
 * Runs a TypeScript file with ts-node AND the @nestjs/swagger compiler plugin (the one `nest build` uses). Without the plugin the
 * exported OpenAPI file has empty schemas and no query parameters, because they are read from the DTO classes at compile time.
 * usage: node scripts/run-with-swagger-plugin.js src/openapi-export.ts
 */
const path = require('node:path');
const tsNode = require('ts-node');
const swagger = require('@nestjs/swagger/plugin');
tsNode.register({
  project: path.join(__dirname, '..', 'tsconfig.json'),
  transformers: (program) => ({
    before: [swagger.before({ classValidatorShim: true, introspectComments: true, dtoFileNameSuffix: ['.dto.ts'], controllerFileNameSuffix: ['.controller.ts'] }, program)],
  }),
});
require(path.resolve(process.argv[2]));
