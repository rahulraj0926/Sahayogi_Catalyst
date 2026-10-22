import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ActivityPageDto, ActivityQueryDto, CalendarDto, CalendarQueryDto, HomeDto, KpisDto, ProductsPageDto, ProductsQueryDto } from './dto/home.dto';
import { HomeService } from './home.service';

@ApiTags('Home')
@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  @ApiOkResponse({ type: HomeDto, description: 'First paint of the Home screen in one call: KPI cards, first page of products, open ideas, recent activity and this month’s calendar.' })
  overview() { return this.home.overview(); }

  @Get('kpis')
  @ApiOkResponse({ type: KpisDto, description: 'Five main and four supporting KPI cards, every number computed from the saved records.' })
  kpis() { return this.home.kpis(); }

  @Get('products')
  @ApiOkResponse({ type: ProductsPageDto, description: 'Products table: name, owner, lifecycle kind, current phase, stage, readiness, health. Filter, sort and page.' })
  products(@Query() q: ProductsQueryDto) { return this.home.products(q); }

  @Get('calendar')
  @ApiOkResponse({ type: CalendarDto, description: 'Dated events (approval deadlines, sign-offs, stage changes, ideas) between two days; default is this month.' })
  calendar(@Query() q: CalendarQueryDto) { return this.home.calendar(q.from, q.to); }

  @Get('activity')
  @ApiOkResponse({ type: ActivityPageDto, description: 'What people did recently across all products, newest first. Pass `next` back as `cursor` for older entries.' })
  activity(@Query() q: ActivityQueryDto) { return this.home.activity(q.limit, q.cursor); }
}
