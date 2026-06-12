import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { VehicleStatus } from '../types/enums';
import { MaintenanceService } from './maintenance.service';

@Injectable()
export class VehicleService {
  private rows = [{ id: 1, plateNo: '沪A-7821', vehicleType: 'Refrigerated', brandModel: '东风天锦 KR', purchaseDate: '2023-03-12', insuranceExpireDate: '2026-09-30', inspectionExpireDate: '2026-11-20', status: 'Available', mileage: 88210, tankCapacity: 380, dailyFixedCost: 260 }];

  constructor(private readonly maintenanceService: MaintenanceService) {}

  findAll() { return this.rows; }
  findOne(id: number) { return this.rows.find((item: any) => item.id === id); }
  create(payload: any) { const row = { ...payload, id: this.rows.length + 1 }; this.rows.push(row); return row; }

  updateStatus(id: number, status: VehicleStatus) {
    const vehicle = this.findOne(id);
    if (!vehicle) {
      throw new NotFoundException(`车辆 ID ${id} 不存在`);
    }
    vehicle.status = status;
    return vehicle;
  }

  isAvailableForDispatch(id: number): { available: boolean; reason?: string } {
    const vehicle = this.findOne(id);
    if (!vehicle) {
      return { available: false, reason: `车辆 ID ${id} 不存在` };
    }
    if (vehicle.status === VehicleStatus.Maintenance) {
      return { available: false, reason: '车辆处于保养/维修状态，不可指派' };
    }
    if (vehicle.status === VehicleStatus.Retired) {
      return { available: false, reason: '车辆已报废，不可指派' };
    }
    if (vehicle.status === VehicleStatus.OnTrip) {
      return { available: false, reason: '车辆正在执行任务中，不可重复指派' };
    }
    const activeMaintenance = this.maintenanceService.findAll().find(
      (m: any) => m.vehicleId === id && m.status === 'InProgress'
    );
    if (activeMaintenance) {
      return { available: false, reason: '车辆有未完成的保养/维修工单，不可指派' };
    }
    return { available: true };
  }
}
