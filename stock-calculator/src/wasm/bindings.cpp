#include <emscripten/emscripten.h>

extern "C" {

double runMonteCarloDemandLoss(double q, double muWeek, double sigmaWeek, double weeks, int iterations);
double calculateOptimalOrderQ(double margin, double price, double mu, double sigma, double weeks);
double normalCDF_cpp(double x);
double normalPDF_cpp(double x);
double evaluateScenarioBS(double q, double mean, double std_dev, double fullPrice, double rushUnitRevenue, double rushProb, int trials, int seed, double K, double T, double r);

EMSCRIPTEN_KEEPALIVE
double mcDemandLoss(double q, double muWeek, double sigmaWeek, double weeks, int iterations) {
    return runMonteCarloDemandLoss(q, muWeek, sigmaWeek, weeks, iterations);
}

EMSCRIPTEN_KEEPALIVE
double getOptimalQ(double margin, double price, double mu, double sigma, double weeks) {
    return calculateOptimalOrderQ(margin, price, mu, sigma, weeks);
}

EMSCRIPTEN_KEEPALIVE
double getNormalCDF(double x) {
    return normalCDF_cpp(x);
}

EMSCRIPTEN_KEEPALIVE
double getNormalPDF(double x) {
    return normalPDF_cpp(x);
}

EMSCRIPTEN_KEEPALIVE
double evaluateScenarioBS_wasm(double q, double mean, double std_dev, double fullPrice, double rushUnitRevenue, double rushProb, int trials, int seed, double K, double T, double r) {
    return evaluateScenarioBS(q, mean, std_dev, fullPrice, rushUnitRevenue, rushProb, trials, seed, K, T, r);
}

}
