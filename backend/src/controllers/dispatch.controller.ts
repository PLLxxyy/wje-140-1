import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { DispatchService } from '../services/dispatch.service';
import { DispatchStatus } from '../types/enums';

interface UpdateStatusDto {
  status: DispatchStatus;
}

@Controller('dispatch-orders')
export class DispatchController {
  constructor(private readonly service: DispatchService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(Number(id)); }
  @Post() create(@Body() payload: any) { return this.service.create(payload); }
  @Put(':id/status') updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatus(Number(id), dto.status);
  }
}
