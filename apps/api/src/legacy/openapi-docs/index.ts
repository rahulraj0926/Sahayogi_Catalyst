import { analysisDocs } from './analysis';
import { filesDocs } from './files';
import { gatesDocs } from './gates';
import { itemsDocs } from './items';
import { portfolioDocs } from './portfolio';
import { workDocs } from './work';
import type { DocSet, RouteDoc, Schema } from './types';

const sets: DocSet[] = [itemsDocs, gatesDocs, portfolioDocs, filesDocs, analysisDocs, workDocs];

/** Keys are "METHOD /api/path/{param}" (OpenAPI spelling). */
export const routeDocs: Record<string, RouteDoc> = Object.assign({}, ...sets.map((s) => s.routes));
export const docSchemas: Record<string, Schema> = Object.assign({}, ...sets.map((s) => s.schemas || {}));
