import { NotFoundException } from '@nestjs/common';
import { VehicleService } from '../services/vehicle.service';
import { MaintenanceService } from '../services/maintenance.service';
import { VehicleStatus } from '../types/enums';

function createServices() {
  const maintenanceService = new MaintenanceService();
  const vehicleService = new VehicleService(maintenanceService);
  return { maintenanceService, vehicleService };
}

describe('VehicleService - 车辆状态检查', () => {
  let maintenanceService: MaintenanceService;
  let vehicleService: VehicleService;

  beforeEach(() => {
    ({ maintenanceService, vehicleService } = createServices());
  });

  describe('isAvailableForDispatch 可用性检查', () => {
    it('Available 状态且无进行中保养 → 可用', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const result = vehicleService.isAvailableForDispatch(1);
      expect(result.available).toBe(true);
    });

    it('OnTrip 状态 → 不可用，提示"已派车/执行中"', () => {
      vehicleService.updateStatus(1, VehicleStatus.OnTrip);
      const result = vehicleService.isAvailableForDispatch(1);
      expect(result.available).toBe(false);
      expect(result.reason).toMatch(/已派车\/执行中/);
    });

    it('Maintenance 状态 → 不可用，提示"保养/维修中"', () => {
      vehicleService.updateStatus(1, VehicleStatus.Maintenance);
      const result = vehicleService.isAvailableForDispatch(1);
      expect(result.available).toBe(false);
      expect(result.reason).toMatch(/保养\/维修中/);
    });

    it('Retired 状态 → 不可用，提示"已报废"', () => {
      vehicleService.updateStatus(1, VehicleStatus.Retired);
      const result = vehicleService.isAvailableForDispatch(1);
      expect(result.available).toBe(false);
      expect(result.reason).toMatch(/已报废/);
    });

    it('Available 但有进行中保养工单 → 不可用', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      maintenanceService.create({
        vehicleId: 1,
        maintenanceType: 'Repair',
        item: '引擎维修',
        cost: 3000,
        vendor: '维修厂',
        date: '2026-06-12',
        nextMileage: 100000,
        nextDate: '2026-12-12',
        status: 'InProgress',
      });
      const result = vehicleService.isAvailableForDispatch(1);
      expect(result.available).toBe(false);
      expect(result.reason).toMatch(/未完成的保养/);
    });

    it('Available 且保养工单已完成 → 可用', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      maintenanceService.create({
        vehicleId: 1,
        maintenanceType: 'Routine',
        item: '常规保养',
        cost: 500,
        vendor: '维保站',
        date: '2026-06-10',
        nextMileage: 100000,
        nextDate: '2026-12-10',
        status: 'Completed',
      });
      const result = vehicleService.isAvailableForDispatch(1);
      expect(result.available).toBe(true);
    });

    it('不存在的车辆 → 不可用', () => {
      const result = vehicleService.isAvailableForDispatch(9999);
      expect(result.available).toBe(false);
      expect(result.reason).toMatch(/不存在/);
    });
  });

  describe('updateStatus 状态更新', () => {
    it('正常更新 Available → Maintenance', () => {
      const v = vehicleService.updateStatus(1, VehicleStatus.Maintenance);
      expect(v!.status).toBe(VehicleStatus.Maintenance);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Maintenance);
    });

    it('更新不存在的车辆抛 NotFoundException', () => {
      expect(() => vehicleService.updateStatus(9999, VehicleStatus.Available)).toThrow(NotFoundException);
    });
  });
});
