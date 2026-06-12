import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DispatchStatus, VehicleStatus } from '../types/enums';
import { VehicleService } from './vehicle.service';

const VALID_TRANSITIONS: Record<string, DispatchStatus[]> = {
  [DispatchStatus.Draft]: [DispatchStatus.Assigned, DispatchStatus.InProgress, DispatchStatus.Cancelled],
  [DispatchStatus.Assigned]: [DispatchStatus.InProgress, DispatchStatus.Cancelled],
  [DispatchStatus.InProgress]: [DispatchStatus.Completed, DispatchStatus.Cancelled],
  [DispatchStatus.Completed]: [],
  [DispatchStatus.Cancelled]: [],
};

const ACTIVE_STATUSES: DispatchStatus[] = [DispatchStatus.Assigned, DispatchStatus.InProgress];

@Injectable()
export class DispatchService {
  private rows = [{ id: 1, orderNo: 'DSP-20260612-0001', vehicleId: 1, driverId: 1, origin: '上海青浦仓', destination: '杭州萧山仓', planDepartAt: '2026-06-12 09:00', planArriveAt: '2026-06-12 13:30', cargo: '冷链食品', weight: 8200, volume: 42, freight: 7200, estimatedFuelCost: 1500, estimatedTollCost: 420, status: 'Assigned', profit: 4180 }];

  constructor(private readonly vehicleService: VehicleService) {}

  findAll() { return this.rows; }
  findOne(id: number) { return this.rows.find((item: any) => item.id === id); }

  findActiveOrderByVehicle(vehicleId: number, excludeOrderId?: number) {
    return this.rows.find(
      (item: any) => item.vehicleId === vehicleId &&
        ACTIVE_STATUSES.includes(item.status as DispatchStatus) &&
        item.id !== excludeOrderId
    );
  }

  private checkVehicleAvailableForNewOrder(vehicleId: number) {
    const checkResult = this.vehicleService.isAvailableForDispatch(vehicleId);
    if (!checkResult.available) {
      throw new BadRequestException(checkResult.reason);
    }
    const existingOrder = this.findActiveOrderByVehicle(vehicleId);
    if (existingOrder) {
      throw new BadRequestException(`车辆已被调度单 ${(existingOrder as any).orderNo} 占用，不可重复指派`);
    }
  }

  create(payload: any) {
    if (payload.status === DispatchStatus.Assigned || payload.status === DispatchStatus.InProgress) {
      this.checkVehicleAvailableForNewOrder(payload.vehicleId);
      this.vehicleService.updateStatus(payload.vehicleId, VehicleStatus.OnTrip);
    }
    const row = { ...payload, id: this.rows.length + 1 };
    this.rows.push(row);
    return row;
  }

  updateStatus(id: number, status: DispatchStatus) {
    const order = this.findOne(id);
    if (!order) {
      throw new NotFoundException(`调度单 ID ${id} 不存在`);
    }
    const oldStatus = order.status as DispatchStatus;

    if (!VALID_TRANSITIONS[oldStatus]?.includes(status)) {
      throw new BadRequestException(`调度单不允许从 ${oldStatus} 变更为 ${status}`);
    }

    const isFirstAssignment = oldStatus === DispatchStatus.Draft &&
      (status === DispatchStatus.Assigned || status === DispatchStatus.InProgress);

    if (isFirstAssignment) {
      this.checkVehicleAvailableForNewOrder(order.vehicleId);
      this.vehicleService.updateStatus(order.vehicleId, VehicleStatus.OnTrip);
    }

    if (status === DispatchStatus.Completed || status === DispatchStatus.Cancelled) {
      if (oldStatus === DispatchStatus.Assigned || oldStatus === DispatchStatus.InProgress) {
        this.vehicleService.updateStatus(order.vehicleId, VehicleStatus.Available);
      }
    }

    order.status = status;
    return {
      order,
      vehicleStatusUpdated: true,
      message: `调度单状态已更新为 ${status}，车辆状态已同步更新`
    };
  }
}
