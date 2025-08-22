-- Простая вставка тестовых данных в wb_costs
-- Используем известный user_id из wb_stocks

DO $$
DECLARE
    target_user_id UUID;
    today_date timestamp := NOW()::date;
BEGIN
    -- Получаем user_id из wb_stocks
    SELECT DISTINCT user_id INTO target_user_id 
    FROM wb_stocks 
    LIMIT 1;
    
    IF target_user_id IS NULL THEN
        RAISE NOTICE 'No user found in wb_stocks';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Using user_id: %', target_user_id;
    
    -- Вставляем тестовые данные для нескольких SKU
    INSERT INTO wb_costs (user_id, date, sku, purchase_amount, purchase_currency, logistics_amount, logistics_currency, fx_rate)
    VALUES 
        (target_user_id, today_date, 'EXAMPLE_SKU_1', 21, 'CNY', 0.98, 'USD', 13.0),
        (target_user_id, today_date, 'EXAMPLE_SKU_2', 25, 'CNY', NULL, NULL, 13.0),
        (target_user_id, today_date, 'EXAMPLE_SKU_3', 26, 'CNY', NULL, NULL, 13.0),
        (target_user_id, today_date, '123456789', 21, 'CNY', 0.98, 'USD', 13.0),
        (target_user_id, today_date, '987654321', 25, 'CNY', NULL, NULL, 13.0)
    ON CONFLICT (user_id, date, sku) 
    DO UPDATE SET
        purchase_amount = EXCLUDED.purchase_amount,
        purchase_currency = EXCLUDED.purchase_currency,
        logistics_amount = EXCLUDED.logistics_amount,
        logistics_currency = EXCLUDED.logistics_currency,
        fx_rate = EXCLUDED.fx_rate,
        updated_at = NOW();
    
    RAISE NOTICE 'Inserted test cost data';
    
    -- Показываем результат
    RAISE NOTICE 'Total wb_costs records: %', (SELECT COUNT(*) FROM wb_costs WHERE user_id = target_user_id);
END $$;
