#include <emscripten/emscripten.h>

extern "C" {

double runMonteCarloDemandLoss(double q, double muWeek, double sigmaWeek, double weeks, int iterations);
double calculateOptimalOrderQ(double margin, double price, double mu, double sigma, double weeks);
double normalCDF_cpp(double x);
double normalPDF_cpp(double x);

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

}
