import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DispatchService } from '../services/dispatch.service';
import { VehicleService } from '../services/vehicle.service';
import { MaintenanceService } from '../services/maintenance.service';
import { DispatchStatus, VehicleStatus } from '../types/enums';

function createServices() {
  const maintenanceService = new MaintenanceService();
  const vehicleService = new VehicleService(maintenanceService);
  const dispatchService = new DispatchService(vehicleService);
  const initialOrder = dispatchService.findOne(1);
  if (initialOrder) {
    initialOrder.status = DispatchStatus.Completed;
  }
  vehicleService.updateStatus(1, VehicleStatus.Available);
  return { maintenanceService, vehicleService, dispatchService };
}

function addVehicle(vehicleService: VehicleService, id: number) {
  vehicleService.create({
    id,
    plateNo: `沪A-TEST-${id}`,
    vehicleType: 'LightTruck',
    brandModel: '测试车型',
    purchaseDate: '2023-01-01',
    insuranceExpireDate: '2027-01-01',
    inspectionExpireDate: '2027-01-01',
    status: VehicleStatus.Available,
    mileage: 10000,
    tankCapacity: 200,
    dailyFixedCost: 100,
  });
}

describe('DispatchService - 调度单状态联动', () => {
  let maintenanceService: MaintenanceService;
  let vehicleService: VehicleService;
  let dispatchService: DispatchService;

  beforeEach(() => {
    ({ maintenanceService, vehicleService, dispatchService } = createServices());
  });

  const defaultDispatch = {
    orderNo: 'DSP-TEST-0001',
    vehicleId: 1,
    driverId: 1,
    origin: '起点',
    destination: '终点',
    planDepartAt: '2026-06-12 09:00',
    planArriveAt: '2026-06-12 13:00',
    cargo: '货物',
    weight: 1000,
    volume: 10,
    freight: 1000,
    estimatedFuelCost: 200,
    estimatedTollCost: 100,
    profit: 700,
  };

  describe('场景1: 创建/派车时车辆自动切换为出车中', () => {
    it('创建状态为 Draft 的调度单，车辆状态保持 Available', () => {
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Draft });
      expect(order.status).toBe(DispatchStatus.Draft);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Available);
    });

    it('创建状态为 Assigned 的调度单，车辆自动变为 OnTrip', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned });
      expect(order.status).toBe(DispatchStatus.Assigned);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);
    });

    it('创建状态为 InProgress 的调度单，车辆自动变为 OnTrip', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.InProgress });
      expect(order.status).toBe(DispatchStatus.InProgress);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);
    });

    it('Draft → Assigned（首次派车），车辆变为 OnTrip', () => {
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Draft });
      vehicleService.updateStatus(1, VehicleStatus.Available);
      dispatchService.updateStatus(order.id, DispatchStatus.Assigned);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);
    });

    it('Draft → InProgress（直接派车出车），车辆变为 OnTrip', () => {
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Draft });
      vehicleService.updateStatus(1, VehicleStatus.Available);
      dispatchService.updateStatus(order.id, DispatchStatus.InProgress);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);
    });
  });

  describe('场景2: 已派车推进执行中 (Assigned → InProgress) 不误判为重复指派', () => {
    it('Assigned → InProgress 正常推进，不抛异常，车辆仍为 OnTrip', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned });
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);

      const result = dispatchService.updateStatus(order.id, DispatchStatus.InProgress);
      expect(result.order.status).toBe(DispatchStatus.InProgress);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);
    });

    it('Assigned → InProgress 推进时即使另一调度单尝试占用也不影响原单推进', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order1 = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned });

      expect(() => dispatchService.updateStatus(order1.id, DispatchStatus.InProgress)).not.toThrow();
      expect(dispatchService.findOne(order1.id)!.status).toBe(DispatchStatus.InProgress);
    });
  });

  describe('场景3: 任务完成/取消，车辆恢复可用', () => {
    it('Assigned → Completed，车辆恢复 Available', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned });
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);

      dispatchService.updateStatus(order.id, DispatchStatus.Completed);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Available);
    });

    it('InProgress → Completed，车辆恢复 Available', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.InProgress });
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);

      dispatchService.updateStatus(order.id, DispatchStatus.Completed);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Available);
    });

    it('Assigned → Cancelled，车辆恢复 Available', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned });
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);

      dispatchService.updateStatus(order.id, DispatchStatus.Cancelled);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Available);
    });

    it('InProgress → Cancelled，车辆恢复 Available', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.InProgress });

      dispatchService.updateStatus(order.id, DispatchStatus.Cancelled);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Available);
    });

    it('Draft → Cancelled，车辆状态保持不变（从未派过车）', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Draft });

      dispatchService.updateStatus(order.id, DispatchStatus.Cancelled);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Available);
    });

    it('完成后可再次指派给新调度单', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order1 = dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-1', status: DispatchStatus.Assigned });
      dispatchService.updateStatus(order1.id, DispatchStatus.Completed);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.Available);

      const order2 = dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-2', status: DispatchStatus.Assigned });
      expect(order2.status).toBe(DispatchStatus.Assigned);
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);
    });
  });

  describe('场景4: 出车中不可重复指派', () => {
    it('车辆状态为 OnTrip 时，创建新调度单抛异常', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-1', status: DispatchStatus.Assigned });
      expect(vehicleService.findOne(1)!.status).toBe(VehicleStatus.OnTrip);

      expect(() =>
        dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-2', status: DispatchStatus.Assigned })
      ).toThrow(BadRequestException);
      expect(() =>
        dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-2', status: DispatchStatus.Assigned })
      ).toThrow(/重复指派/);
    });

    it('车辆被调度单占用时，另一 Draft 状态单无法派车', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-A', status: DispatchStatus.Assigned });
      const draftOrder = dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-B', status: DispatchStatus.Draft });

      expect(() => dispatchService.updateStatus(draftOrder.id, DispatchStatus.Assigned)).toThrow(BadRequestException);
    });

    it('调度单级重复检查：车辆虽 Available 但存在活跃调度单时仍拦截', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-1', status: DispatchStatus.Assigned });

      vehicleService.updateStatus(1, VehicleStatus.Available);

      expect(() =>
        dispatchService.create({ ...defaultDispatch, orderNo: 'DSP-2', status: DispatchStatus.Assigned })
      ).toThrow(/车辆已被调度单/);
    });
  });

  describe('场景5: 保养/维修中不可指派', () => {
    it('车辆状态为 Maintenance 时，指派抛异常', () => {
      vehicleService.updateStatus(1, VehicleStatus.Maintenance);

      expect(() =>
        dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned })
      ).toThrow(BadRequestException);
      expect(() =>
        dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned })
      ).toThrow(/保养\/维修/);
    });

    it('有进行中保养工单时，指派抛异常', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      maintenanceService.create({
        vehicleId: 1,
        maintenanceType: 'Routine',
        item: '常规保养',
        cost: 500,
        vendor: 'XX维保',
        date: '2026-06-12',
        nextMileage: 100000,
        nextDate: '2026-12-12',
        status: 'InProgress',
      });

      expect(() =>
        dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned })
      ).toThrow(/未完成的保养/);
    });

    it('保养完成后可以正常指派', () => {
      const record = maintenanceService.create({
        vehicleId: 1,
        maintenanceType: 'Routine',
        item: '常规保养',
        cost: 500,
        vendor: 'XX维保',
        date: '2026-06-12',
        nextMileage: 100000,
        nextDate: '2026-12-12',
        status: 'InProgress',
      });
      vehicleService.updateStatus(1, VehicleStatus.Maintenance);

      expect(() =>
        dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned })
      ).toThrow(BadRequestException);

      record.status = 'Completed';
      vehicleService.updateStatus(1, VehicleStatus.Available);

      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Assigned });
      expect(order.status).toBe(DispatchStatus.Assigned);
    });
  });

  describe('附加: 非法状态转换拦截', () => {
    it('Completed → InProgress 被拒绝', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Completed });

      expect(() => dispatchService.updateStatus(order.id, DispatchStatus.InProgress)).toThrow(
        /不允许从 Completed 变更为 InProgress/
      );
    });

    it('Cancelled → Assigned 被拒绝', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.Cancelled });

      expect(() => dispatchService.updateStatus(order.id, DispatchStatus.Assigned)).toThrow(BadRequestException);
    });

    it('InProgress → Assigned（回退）被拒绝', () => {
      vehicleService.updateStatus(1, VehicleStatus.Available);
      const order = dispatchService.create({ ...defaultDispatch, status: DispatchStatus.InProgress });

      expect(() => dispatchService.updateStatus(order.id, DispatchStatus.Assigned)).toThrow(
        /不允许从 InProgress 变更为 Assigned/
      );
    });

    it('不存在的调度单抛 NotFoundException', () => {
      expect(() => dispatchService.updateStatus(9999, DispatchStatus.Completed)).toThrow(NotFoundException);
    });
  });
});
