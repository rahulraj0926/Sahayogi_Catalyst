import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PortfolioSource } from '../engine-port/ports';
import { ProductRefDto } from './dto/products.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly src: PortfolioSource) {}

  /** Look a product up by id (PRD-001) or by URL name (sahayogi-cdn). The web app uses it to turn an old id address into the readable one. */
  @Get(':ref')
  @ApiOkResponse({ type: ProductRefDto })
  resolve(@Param('ref') ref: string): ProductRefDto {
    const e = this.src.get().get(ref);
    if (!e) throw new NotFoundException({ code: 'product_not_found', message: `There is no product "${ref}".` });
    return { id: e.id, slug: e.slug || e.id, name: e.name };
  }
}
