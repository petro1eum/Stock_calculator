import React, { useState } from 'react';
import { SliderWithValueProps } from '../types';

const SliderWithValue: React.FC<SliderWithValueProps> = ({ 
  label, 
  value, 
  onChange, 
  min, 
  max, 
  step, 
  tooltip, 
  unit = "" 
}) => {
  const [inputValue, setInputValue] = useState(value.toString());
  const [showTooltip, setShowTooltip] = useState(false);
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
    setInputValue(newValue.toString());
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
  };
  
  const handleInputBlur = (): void => {
    let newValue = parseFloat(inputValue);
    if (isNaN(newValue)) {
      newValue = value;
    } else {
      newValue = Math.max(min, Math.min(max, newValue));
    }
    onChange(newValue);
    setInputValue(newValue.toString());
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleInputBlur();
    }
  };
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium text-gray-700 flex items-center relative">
          {label}
          {tooltip && (
            <>
              <span 
                className="ml-2 inline-flex items-center justify-center w-4 h-4 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded-full text-xs cursor-help transition-colors"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                ?
              </span>
              {showTooltip && (
                <div className="absolute z-10 left-0 top-6 w-80 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg">
                  {tooltip}
                  <div className="absolute -top-2 left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800"></div>
                </div>
              )}
            </>
          )}
        </label>
        <div className="flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="w-16 p-1 text-center text-sm border border-gray-300 rounded"
          />
          <span className="ml-1 text-sm font-bold text-blue-700">{unit}</span>
        </div>
      </div>
      <input 
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSliderChange}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
      <div className="flex justify-between text-xs text-gray-500">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};

export default SliderWithValue; 