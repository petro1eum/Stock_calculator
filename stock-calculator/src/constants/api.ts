// API endpoints constants
export const WB_API_ENDPOINTS = {
  BASE_MARKETPLACE: 'https://marketplace-api.wildberries.ru',
  BASE_STATISTICS: 'https://statistics-api.wildberries.ru', 
  BASE_SUPPLIERS: 'https://suppliers-api.wildberries.ru',
  BASE_PRICES: 'https://discounts-prices-api.wildberries.ru',
  BASE_ANALYTICS: 'https://seller-analytics-api.wildberries.ru',
  
  // Marketplace API
  WAREHOUSES: '/api/v3/warehouses',
  ORDERS: '/api/v3/orders',
  ORDER_STATUS: '/api/v3/orders/{orderId}/status',
  
  // Statistics API  
  SALES: '/api/v1/supplier/sales',
  STOCKS: '/api/v1/supplier/stocks',
  INCOMES: '/api/v1/supplier/incomes',
  
  // Suppliers API (alternative endpoints)
  SUPPLIERS_STOCKS: '/api/v1/supplier/stocks',
  SUPPLIERS_SALES: '/api/v1/supplier/sales',
  SUPPLIERS_INCOMES: '/api/v1/supplier/incomes',
  SUPPLIERS_ORDERS: '/api/v1/supplier/orders',
  SUPPLIERS_INFO: '/public/api/v1/info',
  
  // Prices API
  PRICES_FILTER: '/api/v2/list/goods/filter',
  
  // Analytics API
  NM_REPORT_DETAIL: '/api/v2/nm-report/detail',
  
  // Test endpoint
  PING: '/ping'
} as const;

// Helper functions to build full URLs
export const buildWbUrl = (base: string, endpoint: string, params?: Record<string, string | number>) => {
  let url = `${base}${endpoint}`;
  
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, value.toString());
    });
    url += `?${searchParams.toString()}`;
  }
  
  return url;
};

// Common URL builders
export const getWbSalesUrl = (dateFrom: string) => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_STATISTICS, WB_API_ENDPOINTS.SALES, { dateFrom });

export const getWbStocksUrl = (dateFrom: string) => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_STATISTICS, WB_API_ENDPOINTS.STOCKS, { dateFrom });

export const getWbIncomesUrl = (dateFrom: string) => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_STATISTICS, WB_API_ENDPOINTS.INCOMES, { dateFrom });

export const getWbOrdersUrl = (limit: number = 10, next: number = 0) => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_MARKETPLACE, WB_API_ENDPOINTS.ORDERS, { limit, next });

export const getWbWarehousesUrl = () => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_MARKETPLACE, WB_API_ENDPOINTS.WAREHOUSES);

export const getWbPingUrl = () => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_MARKETPLACE, WB_API_ENDPOINTS.PING);

export const getWbPricesUrl = (limit: number = 1000) => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_PRICES, WB_API_ENDPOINTS.PRICES_FILTER, { limit });

export const getWbAnalyticsUrl = () => 
  buildWbUrl(WB_API_ENDPOINTS.BASE_ANALYTICS, WB_API_ENDPOINTS.NM_REPORT_DETAIL);
