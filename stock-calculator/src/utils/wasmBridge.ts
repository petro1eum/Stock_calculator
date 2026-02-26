// Объявление типов для функций, созданных Emscripten
export interface StockMathWasm {
    _malloc(size: number): number;
    _free(ptr: number): void;
    getValue(ptr: number, type: string): number;
    setValue(ptr: number, value: number, type: string): void;

    // Экспортированные обертки C++
    mcDemandLoss: (q: number, muWeek: number, sigmaWeek: number, weeks: number, iterations: number) => number;
    getOptimalQ: (margin: number, price: number, mu: number, sigma: number, weeks: number) => number;
    getNormalCDF: (x: number) => number;
    getNormalPDF: (x: number) => number;
    evaluateScenarioBS: (q: number, mean: number, std: number, fullPrice: number, rushUnitRevenue: number, rushProb: number, trials: number, seed: number, K: number, T: number, r: number) => number;
}

// Глобальная ссылка на модуль, который загружается один раз
let wasmModulePromise: Promise<StockMathWasm> | null = null;
let cachedWasmModule: StockMathWasm | null = null;

export const getCachedWasmModule = (): StockMathWasm | null => cachedWasmModule;

declare const window: any;

/**
 * Инициализирует и возвращает загруженный Wasm модуль.
 */
export const getWasmModule = async (): Promise<StockMathWasm> => {
    if (cachedWasmModule) return cachedWasmModule;
    if (wasmModulePromise) return wasmModulePromise;

    wasmModulePromise = new Promise((resolve, reject) => {
        try {
            // Ищем функцию-загрузчик, созданную Emscripten
            if (typeof window.createStockMathModule !== 'function') {
                // Если скрипт еще не добавлен в DOM
                const script = document.createElement('script');
                script.src = '/wasm/stock_math.js';
                script.onload = () => {
                    if (typeof window.createStockMathModule === 'function') {
                        window.createStockMathModule().then((mod: any) => {
                            bindWasmMethods(mod);
                            cachedWasmModule = mod;
                            resolve(mod);
                        }).catch(reject);
                    } else {
                        reject(new Error('createStockMathModule not found in loaded script'));
                    }
                };
                script.onerror = () => reject(new Error('Failed to load Wasm script'));
                document.body.appendChild(script);
            } else {
                window.createStockMathModule().then((mod: any) => {
                    bindWasmMethods(mod);
                    cachedWasmModule = mod;
                    resolve(mod);
                }).catch(reject);
            }
        } catch (e) {
            reject(e);
        }
    });

    return wasmModulePromise;
};

// Привязываем cwrap функции к объекту модуля для удобства
const bindWasmMethods = (mod: any) => {
    mod.mcDemandLoss = mod.cwrap('mcDemandLoss', 'number', ['number', 'number', 'number', 'number', 'number']);
    mod.getOptimalQ = mod.cwrap('getOptimalQ', 'number', ['number', 'number', 'number', 'number', 'number']);
    mod.getNormalCDF = mod.cwrap('getNormalCDF', 'number', ['number']);
    mod.getNormalPDF = mod.cwrap('getNormalPDF', 'number', ['number']);
    mod.evaluateScenarioBS = mod.cwrap('evaluateScenarioBS_wasm', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']
    );
};

export const runWasmMonteCarlo = async (q: number, muWeek: number, sigmaWeek: number, weeks: number, iterations: number): Promise<number> => {
    const mod = await getWasmModule();
    return mod.mcDemandLoss(q, muWeek, sigmaWeek, weeks, iterations);
};

export const runWasmOptimalQ = async (margin: number, price: number, mu: number, sigma: number, weeks: number): Promise<number> => {
    const mod = await getWasmModule();
    return mod.getOptimalQ(margin, price, mu, sigma, weeks);
};
