#include <cmath>
#include <random>
#include <vector>
#include <algorithm>
#include <iostream>

extern "C" {

    // Вспомогательная функция для нормального кумулятивного распределения
    double normalCDF_cpp(double x) {
        return 0.5 * std::erfc(-x * M_SQRT1_2);
    }

    // Вспомогательная функция для плотности нормального распределения
    double normalPDF_cpp(double x) {
        return std::exp(-0.5 * x * x) / std::sqrt(2.0 * M_PI);
    }

    // Алгоритм Монте-Карло для оценки ожидаемых потерь продаж (упущенного спроса)
    // q - текущий доступный запас
    // muWeek - средний спрос в неделю
    // sigmaWeek - стандартное отклонение спроса в неделю
    // weeks - количество недель
    // iterations - количество итераций (например 10000)
    // return double - ожидаемые потерянные продажи
    double runMonteCarloDemandLoss(double q, double muWeek, double sigmaWeek, double weeks, int iterations) {
        if (iterations <= 0 || weeks <= 0) return 0.0;
        
        double totalDemand = muWeek * weeks;
        double totalStdDev = sigmaWeek * std::sqrt(weeks);
        
        // Быстрый генератор MT19937
        std::mt19937 gen(42); // Фиксированный сид для детерминированности, можно заменить на std::random_device{}()
        std::normal_distribution<double> d(totalDemand, totalStdDev);
        
        double sumLost = 0.0;
        
        for (int i = 0; i < iterations; ++i) {
            double simulatedDemand = d(gen);
            if (simulatedDemand < 0.0) simulatedDemand = 0.0; // Спрос не может быть отрицательным
            
            double loss = simulatedDemand - q;
            if (loss > 0) {
                sumLost += loss;
            }
        }
        
        return sumLost / static_cast<double>(iterations);
    }

    // Формула оптимизации заказа (оптимальный Q*) по модели Ньюсвендора с учетом Black-Scholes like parameters
    // margin - маржа прибыли
    // price - цена закупки
    // mu - средний спрос
    // sigma - стандартное отклонение
    // weeks - период недель
    double calculateOptimalOrderQ(double margin, double price, double mu, double sigma, double weeks) {
        double criticalRatio = margin / (margin + price);
        
        double totalMu = mu * weeks;
        double totalSigma = sigma * std::sqrt(weeks);
        
        // Inverse Normal CDF (Пробная аппроксимация Beasley-Springer-Moro)
        // Для простоты здесь используем базовую C++17 <random> функциональность 
        // или обойдемся аппроксимацией
        // Approximation of percent point function (inverse CDF)
        double p = criticalRatio;
        if (p <= 0.0) return 0.0;
        if (p >= 1.0) return totalMu + 5 * totalSigma; // Заглушка для 100% обслуживания
        
        // Approximation formula
        double q = p - 0.5;
        double r = 0.0;
        if (std::abs(q) <= 0.425) {
            r = 0.180625 - q * q;
            double num = 2.5090809287301226727 + r * (33.430575583588128105 + r * (67.265770927008700853 + r * (45.921953931549871457 + r * (13.731693765509004354 + r * (1.9715909503065514427 + r * 1.3314166685922881220e-2)))));
            double den = 1.0 + r * (33.000949816556101183 + r * (79.141514782352864627 + r * (70.364219436343516606 + r * (25.101740924905188828 + r * (3.3283282218738321458 + r * 1.5644158428519782806e-2)))));
            double val = q * num / den;
            return totalMu + val * totalSigma;
        } else {
            r = q < 0 ? p : 1.0 - p;
            r = std::sqrt(-std::log(r));
            double num = -3.22232431088 + r * (-1.0 + r * (-0.342242088547 + r * (-0.0204231210245 + r * -0.0000453642210148)));
            double den = 0.0993484626060 + r * (0.588581570495 + r * (0.531103462366 + r * (0.103537752850 + r * 0.0038560700634)));
            double val = num / den;
            val = q < 0 ? -val : val;
            return totalMu + val * totalSigma;
        }
    }

}
