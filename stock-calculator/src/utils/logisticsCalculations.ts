import { LogisticsEvent } from '../types';

/**
 * Рассчитывает lead time с учетом календаря логистических рисков
 * @param baseLead - базовый lead time в неделях
 * @param country - страна поставщика
 * @param logisticsEvents - массив событий календаря рисков
 * @param fromDate - дата заказа (для проверки пересечений с событиями)
 * @returns скорректированный lead time в неделях
 */
export function calculateAdjustedLeadTime(
  baseLead: number,
  country: string = 'China',
  logisticsEvents: LogisticsEvent[] = [],
  fromDate: Date = new Date()
): number {
  if (!logisticsEvents.length) return baseLead;

  // Прогнозируемая дата прибытия на основе базового lead time
  const estimatedArrival = new Date(fromDate);
  estimatedArrival.setDate(estimatedArrival.getDate() + baseLead * 7);

  let totalDelayDays = 0;

  // Проверяем пересечения с событиями календаря рисков
  for (const event of logisticsEvents) {
    const eventStart = new Date(event.start_date);
    const eventEnd = new Date(event.end_date);

    // Проверяем, подходит ли событие по стране/региону
    const countryMatch = !event.country || 
      event.country.toLowerCase() === country.toLowerCase() ||
      event.country.toLowerCase() === 'global';

    if (!countryMatch) continue;

    // Проверяем пересечение периода доставки с событием
    const shipmentPeriodStart = fromDate;
    const shipmentPeriodEnd = estimatedArrival;

    const hasOverlap = (
      (shipmentPeriodStart <= eventEnd && shipmentPeriodEnd >= eventStart) ||
      (eventStart <= shipmentPeriodEnd && eventEnd >= shipmentPeriodStart)
    );

    if (hasOverlap) {
      totalDelayDays += event.delay_days;
    }
  }

  // Конвертируем задержку из дней в недели и добавляем к базовому lead time
  const delayWeeks = totalDelayDays / 7;
  return Math.max(baseLead + delayWeeks, baseLead); // не может быть меньше базового
}

/**
 * Рассчитывает среднее историческое lead time на основе заказов и приемок
 * @param purchaseOrders - заказы из Китая
 * @param purchases - приемки WB
 * @param sku - артикул для анализа (опционально)
 * @returns среднее lead time в неделях
 */
export function calculateHistoricalLeadTime(
  purchaseOrders: any[],
  purchases: any[],
  sku?: string
): number {
  const leadTimes: number[] = [];

  for (const order of purchaseOrders) {
    if (!order.items) continue;

    const orderDate = new Date(order.created_at);
    
    for (const item of order.items) {
      // Если указан SKU, фильтруем только по нему
      if (sku && item.sku !== sku) continue;

      // Ищем соответствующие приемки по SKU после даты заказа
      const matchingPurchases = purchases.filter(p => 
        p.sku === item.sku && new Date(p.date) > orderDate
      );

      if (matchingPurchases.length > 0) {
        // Берем первую приемку после заказа
        const firstPurchase = matchingPurchases
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        
        const purchaseDate = new Date(firstPurchase.date);
        const leadTimeDays = Math.ceil((purchaseDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
        const leadTimeWeeks = leadTimeDays / 7;
        
        if (leadTimeWeeks > 0 && leadTimeWeeks < 52) { // разумные границы (до года)
          leadTimes.push(leadTimeWeeks);
        }
      }
    }
  }

  if (leadTimes.length === 0) return 0;

  // Возвращаем среднее
  return leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length;
}

/**
 * Рассчитывает общую себестоимость с учетом заказов из Китая
 * @param sku - артикул
 * @param purchaseOrders - заказы из Китая
 * @param wbPurchases - приемки WB
 * @returns объект с данными о себестоимости
 */
export function calculateLandedCost(
  sku: string,
  purchaseOrders: any[],
  wbPurchases: any[]
) {
  let totalChinaCost = 0;
  let totalLogisticsCost = 0;
  let totalQuantity = 0;
  let lastOrderDate: Date | null = null;

  // Анализируем заказы из Китая
  for (const order of purchaseOrders) {
    if (!order.items) continue;

    const orderDate = new Date(order.created_at);
    
    for (const item of order.items) {
      if (item.sku !== sku) continue;

      const qty = item.qty || 0;
      const unitCost = item.unit_cost || 0;
      
      totalChinaCost += qty * unitCost;
      totalQuantity += qty;

      // Пропорциональная часть логистики
      if (order.logistics_cost && order.total_cost) {
        const itemShare = (qty * unitCost) / order.total_cost;
        totalLogisticsCost += order.logistics_cost * itemShare;
      }

      if (!lastOrderDate || orderDate > lastOrderDate) {
        lastOrderDate = orderDate;
      }
    }
  }

  const avgUnitCost = totalQuantity > 0 ? totalChinaCost / totalQuantity : 0;
  const avgLogisticsCost = totalQuantity > 0 ? totalLogisticsCost / totalQuantity : 0;
  const landedCostPerUnit = avgUnitCost + avgLogisticsCost;

  return {
    unitCost: avgUnitCost,
    logisticsCost: avgLogisticsCost,
    landedCost: landedCostPerUnit,
    totalQuantity,
    lastOrderDate
  };
}
