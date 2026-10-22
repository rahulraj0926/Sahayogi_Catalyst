import { Get } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EngineController, EngineRoute } from '../engine.decorators';
import { file } from '../../legacy/routes/http';

/** The user guide (legacy/docs/USER_GUIDE.md) as Markdown text for the Help screen. */
@EngineController('help', 'Help')
export class HelpController {
  // the guide must load even on a blank install with no product
  @Get('guide') @EngineRoute({ noProduct: true })
  guide() {
    const p = path.join(__dirname, '..', '..', 'legacy', 'docs', 'USER_GUIDE.md');
    let text: string;
    try { text = fs.readFileSync(p, 'utf8'); } catch { throw Object.assign(new Error('The user guide file (docs/USER_GUIDE.md) was not found'), { status: 404 }); }
    return file(text, 'text/markdown; charset=utf-8', 'USER_GUIDE.md', 'inline');
  }
}
