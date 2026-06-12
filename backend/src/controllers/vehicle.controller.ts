import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { VehicleService } from '../services/vehicle.service';
import { VehicleStatus } from '../types/enums';

interface UpdateVehicleStatusDto {
  status: VehicleStatus;
}

@Controller('vehicles')
export class VehicleController {
  constructor(private readonly service: VehicleService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(Number(id)); }
  @Get(':id/availability') checkAvailability(@Param('id') id: string) {
    return this.service.isAvailableForDispatch(Number(id));
  }
  @Post() create(@Body() payload: any) { return this.service.create(payload); }
  @Put(':id/status') updateStatus(@Param('id') id: string, @Body() dto: UpdateVehicleStatusDto) {
    return this.service.updateStatus(Number(id), dto.status);
  }
}
