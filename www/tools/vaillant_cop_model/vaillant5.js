var vaillant_data = {
    "5kW": {
        // Columns 
        "speed": [120, 110, 97, 90, 80, 70, 60, 50, 40, 30],
        // Rows
        "ambient": [-20, -15, -12, -7, -2, 0, 2, 7, 10, 12, 15, 20],
    
        "35C": { // 35-30
            "label": "35-30C",
            "cop": [
                [2.2, 2.2, 2.5, 2.5, 2.5, 2.4, 2.6, 2.5, null, null], 
                [2.4, 2.4, 2.7, 2.7, 2.8, 2.8, 3.0, 3.1, null, null],
                [2.5, 2.5, 2.8, 2.8, 2.9, 2.8, 3.0, 3.1, null, null],
                [2.7, 2.7, 3.1, 3.0, 3.0, 2.9, 3.1, 3.1, 3.4, null], 
                [3.0, 3.0, 3.4, 3.3, 3.4, 3.3, 3.5, 3.4, 3.7, 3.6],
                [3.0, 3.0, 3.4, 3.4, 3.4, 3.4, 3.6, 3.6, 3.8, 3.7],
                [3.1, 3.1, 3.4, 3.4, 3.5, 3.5, 3.7, 3.7, 4.0, 3.9],
                [3.3, 3.3, 3.7, 3.7, 3.9, 3.9, 4.2, 4.3, 4.6, 4.1],
                [null, 3.9, 4.5, 4.5, 4.5, 4.5, 4.7, 4.7, 5.1, 5.0],
                [null, null, 4.7, 4.7, 4.8, 4.8, 5.0, 5.1, 5.8, 5.5],
                [null, null, null, 5.0, 5.2, 5.3, 5.6, 5.8, 6.8, 6.7],
                [null, null, null, null, 5.8, 6.0, 6.6, 7.0, 8.5, 8.9],
            ],
            "output": [
                [4.3, 3.8, 3.3, 2.9, 2.4, 1.8, 1.4, 0.9, null, null],
                [4.9, 4.5, 3.9, 3.5, 3.0, 2.5, 2.0, 1.6, null, null],
                [5.4, 4.9, 4.4, 3.9, 3.4, 2.8, 2.3, 1.9, null, null],
                [6.2, 5.6, 5.1, 4.5, 3.9, 3.3, 2.8, 2.2, 1.7, null],
                [7.1, 6.5, 5.9, 5.3, 4.6, 3.9, 3.3, 2.7, 2.1, 1.7],
                [7.2, 6.6, 6.0, 5.4, 4.7, 4.1, 3.5, 2.9, 2.3, 1.8],
                [7.3, 6.7, 6.1, 5.5, 4.9, 4.2, 3.7, 3.0, 2.4, 2.0],
                [8.0, 7.3, 6.7, 6.2, 5.5, 4.9, 4.3, 3.7, 2.9, 2.1],
                [null, 8.5, 7.9, 7.2, 6.3, 5.4, 4.6, 3.9, 3.1, 2.4],
                [null, null, 8.2, 7.5, 6.5, 5.7, 4.8, 4.0, 3.4, 2.5],
                [null, null, null, 7.7, 6.7, 5.9, 5.0, 4.2, 3.5, 2.6],
                [null, null, null, null, 7.1, 6.2, 5.4, 4.5, 3.7, 2.8],        
            ]
        },
        "45C": { // 45-40
            "label": "45-40C",
            "cop": [
                [1.8, 1.8, 1.9, 2.0, 2.1, 2.0, 2.1, 1.9, null, null],
                [2.0, 2.0, 2.2, 2.3, 2.4, 2.3, 2.5, 2.6, null, null],
                [2.1, 2.1, 2.3, 2.3, 2.4, 2.4, 2.6, 2.6, null, null],
                [2.3, 2.3, 2.4, 2.5, 2.6, 2.5, 2.7, 2.7, 2.6, null],
                [2.5, 2.5, 2.7, 2.7, 2.8, 2.7, 2.8, 2.7, 2.6, 2.5],
                [2.7, 2.7, 2.8, 2.8, 2.9, 2.8, 3.0, 2.9, 2.8, 2.7],
                [2.8, 2.8, 2.9, 3.0, 3.1, 3.0, 3.1, 3.0, 2.9, 2.9],
                [3.0, 3.1, 3.3, 3.3, 3.4, 3.3, 3.4, 3.3, 3.1, 3.1],
                [null, 3.3, 3.5, 3.6, 3.7, 3.6, 3.7, 3.7, 3.6, 3.7],
                [null, null, 3.6, 3.7, 3.8, 3.8, 3.8, 3.7, 3.7, 3.9],
                [null, null, null, 3.9, 4.0, 4.0, 4.1, 4.1, 4.1, 4.4],
                [null, null, null, null, 4.3, 4.4, 4.6, 4.7, 4.7, 5.0]
            ],
            "output": [
                [3.9, 3.2, 2.9, 2.7, 2.3, 1.8, 1.4, 0.8, null, null],
                [4.5, 3.9, 3.5, 3.3, 2.9, 2.5, 2.0, 1.4, null, null],
                [4.9, 4.2, 3.9, 3.7, 3.2, 2.7, 2.3, 1.7, null, null],
                [5.6, 4.9, 4.5, 4.2, 3.7, 3.2, 2.7, 2.1, 1.6, null],
                [6.6, 5.9, 5.3, 5.0, 4.4, 3.8, 3.2, 2.5, 2.0, 1.5],
                [6.9, 6.2, 5.6, 5.3, 4.6, 4.0, 3.4, 2.7, 2.1, 1.6],
                [7.3, 6.5, 5.9, 5.5, 4.9, 4.2, 3.6, 2.8, 2.3, 1.7],
                [7.9, 7.2, 6.6, 6.1, 5.4, 4.6, 4.0, 3.1, 2.5, 1.8],
                [null, 7.8, 7.2, 6.7, 6.0, 5.2, 4.4, 3.6, 2.9, 2.2],
                [null, null, 7.5, 7.1, 6.3, 5.5, 4.6, 3.8, 3.0, 2.3],
                [null, null, null, 7.2, 6.4, 5.6, 4.8, 3.9, 3.2, 2.5],
                [null, null, null, null, 6.7, 5.9, 5.1, 4.1, 3.4, 2.6]
            ]
        },
        "55C": { // 55-47
            "label": "55-47C",
            "cop": [
                [1.5, 1.4, 1.5, 1.4, 1.4, 1.3, 1.2, null, null, null],
                [1.7, 1.7, 1.8, 1.8, 1.8, 1.8, 1.8, 1.5, null, null],
                [1.8, 1.8, 1.9, 1.9, 1.9, 1.9, 1.9, 1.6, null, null],
                [1.9, 1.9, 2.0, 2.0, 2.1, 2.0, 2.0, 1.8, 1.4, null],
                [2.2, 2.2, 2.3, 2.3, 2.4, 2.4, 2.4, 2.2, 1.9, 1.7],
                [2.3, 2.3, 2.4, 2.4, 2.5, 2.5, 2.5, 2.3, 2.1, 2.0],
                [2.4, 2.4, 2.5, 2.5, 2.6, 2.6, 2.6, 2.5, 2.3, 2.2],
                [2.6, 2.7, 2.9, 2.9, 2.9, 2.8, 2.7, 2.5, 2.4, 2.3],
                [null, 2.8, 3.0, 3.0, 3.0, 2.9, 2.9, 2.7, 2.6, 2.5],
                [null, null, 3.0, 3.1, 3.1, 3.0, 3.0, 2.8, 2.6, 2.6],
                [null, null, null, 3.2, 3.3, 3.2, 3.2, 3.0, 2.8, 2.7],
                [null, null, null, null, 3.5, 3.5, 3.3, 3.1, 2.8, 2.6]
            ],
            "output": [
                [3.7, 3.0, 2.6, 2.3, 1.9, 1.4, 1.0, null, null, null],
                [4.5, 3.8, 3.4, 3.1, 2.7, 2.2, 1.8, 1.2, null, null],
                [4.8, 4.2, 3.7, 3.4, 3.0, 2.5, 2.1, 1.5, null, null],
                [5.5, 4.8, 4.2, 3.9, 3.5, 3.0, 2.5, 1.8, 1.1, null],
                [6.3, 5.7, 5.0, 4.5, 4.2, 3.6, 3.1, 2.3, 1.7, 1.2],
                [6.6, 6.0, 5.3, 4.8, 4.4, 3.8, 3.2, 2.5, 1.8, 1.4],
                [6.9, 6.2, 5.5, 5.0, 4.6, 4.0, 3.4, 2.7, 2.0, 1.6],
                [7.6, 7.0, 6.5, 5.9, 5.2, 4.4, 3.7, 2.8, 2.3, 1.8],
                [null, 7.3, 6.8, 6.2, 5.5, 4.7, 4.0, 3.1, 2.4, 1.9],
                [null, null, 6.9, 6.3, 5.7, 4.8, 4.2, 3.3, 2.5, 2.0],
                [null, null, null, 6.8, 6.1, 5.2, 4.5, 3.5, 2.7, 2.1],
                [null, null, null, null, 6.6, 5.7, 4.7, 3.7, 2.7, 2.1]
            ]
        },
        "65C": { // 65-57
            "label": "65-57C",
            "cop": [
                [null, null, null, null, null, null, null, null, null, null],
                [null, null, null, null, null, null, null, null, null, null],        
                [1.5, 1.3, 1.3, 1.1, 1.0, null, null, null, null, null],
                [1.8, 1.7, 1.6, 1.6, 1.5, 1.4, 1.2, 1.0, null, null],
                [2.0, 1.9, 1.9, 1.8, 1.8, 1.7, 1.6, 1.4, 1.1, null],
                [2.1, 2.0, 2.1, 2.0, 2.0, 2.0, 1.8, 1.6, 1.3, 1.0],
                [2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.0, 1.7, 1.4, 1.1],
                [2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.1, 1.9, 1.6, 1.4],
                [null, 2.5, 2.6, 2.6, 2.6, 2.6, 2.4, 2.3, 2.1, 1.9],
                [null, null, 2.7, 2.7, 2.8, 2.7, 2.6, 2.5, 2.3, 2.2],
                [null, null, null, 2.8, 2.9, 2.9, 2.8, 2.7, 2.5, 2.3],
                [null, null, null, null, 2.9, 2.9, 2.9, 2.8, 2.6, 2.4]
            ],
            "output": [
                [null, null, null, null, null, null, null, null, null, null],
                [null, null, null, null, null, null, null, null, null, null],
                [4.2, 3.5, 2.9, 2.4, 2.0, null, null, null, null, null],
                [5.4, 4.7, 4.1, 3.6, 3.1, 2.5, 1.9, 1.3, null, null],
                [6.1, 5.4, 4.8, 4.2, 3.8, 3.2, 2.6, 1.9, 1.3, null],
                [6.5, 5.8, 5.2, 4.6, 4.2, 3.5, 2.8, 2.1, 1.4, 0.8],
                [6.8, 6.1, 5.5, 5.0, 4.6, 3.9, 3.1, 2.3, 1.5, 0.9],
                [7.2, 6.4, 5.8, 5.3, 4.9, 4.2, 3.4, 2.6, 1.8, 1.2],
                [null, 7.0, 6.4, 5.9, 5.4, 4.6, 3.8, 3.0, 2.3, 1.6],
                [null, null, 6.7, 6.1, 5.6, 4.8, 4.0, 3.2, 2.5, 1.9],
                [null, null, null, 6.3, 5.8, 5.1, 4.4, 3.5, 2.6, 1.9],
                [null, null, null, null, 5.8, 5.1, 4.4, 3.5, 2.7, 1.9]
            ]
        }
    }
};

/**
 * Performs 1D linear interpolation.
 * @param {number} x The point to find y for.
 * @param {number} x1 The x-coordinate of the first point.
 * @param {number} y1 The y-coordinate of the first point.
 * @param {number} x2 The x-coordinate of the second point.
 * @param {number} y2 The y-coordinate of the second point.
 * @returns {number} The interpolated y-value.
 */
function linearInterp(x, x1, y1, x2, y2) {
    if (x1 === x2) return y1; // Avoid division by zero
    return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
}

/**
 * Finds the COP for a specific flow and ambient temperature, interpolating based on output.
 * @param {object} flowData The data object for a specific flow temperature (e.g., vaillant_data["5kW"]["35C"]).
 * @param {number} ambientIndex The index of the ambient temperature row.
 * @param {number} targetOutput The desired heat output in kW.
 * @returns {number|null} The interpolated COP or null if not possible.
 */
function interpolateForOutput(flowData, ambientIndex, targetOutput) {
    const outputs = flowData.output[ambientIndex];
    const cops = flowData.cop[ambientIndex];

    // Create a clean list of [output, cop] pairs, filtering out nulls
    const validPoints = [];
    for (let i = 0; i < outputs.length; i++) {
        if (outputs[i] !== null && cops[i] !== null) {
            validPoints.push([outputs[i], cops[i]]);
        }
    }

    if (validPoints.length < 2) return null; // Cannot interpolate with fewer than 2 points

    // Sort by output to ensure correct interpolation
    validPoints.sort((a, b) => a[0] - b[0]);
    
    // Handle extrapolation (clamping to the nearest value)
    if (targetOutput <= validPoints[0][0]) return validPoints[0][1];
    if (targetOutput >= validPoints[validPoints.length - 1][0]) return validPoints[validPoints.length - 1][1];

    // Find the two points that bracket the targetOutput
    let p1, p2;
    for (let i = 0; i < validPoints.length - 1; i++) {
        if (targetOutput >= validPoints[i][0] && targetOutput <= validPoints[i + 1][0]) {
            p1 = validPoints[i];
            p2 = validPoints[i + 1];
            break;
        }
    }

    if (!p1 || !p2) return null; // Should not happen due to clamping, but for safety

    return linearInterp(targetOutput, p1[0], p1[1], p2[0], p2[1]);
}


/**
 * Calculates the COP for a given flow temperature, ambient temperature, and heat output
 * by performing trilinear interpolation on the provided heat pump data.
 * @param {object} data The complete heat pump performance data object.
 * @param {number} targetFlowTemp The desired outlet/flow temperature in °C.
 * @param {number} targetAmbientTemp The ambient (outside) temperature in °C.
 * @param {number} targetOutput The desired heat output in kW.
 * @returns {number|null} The calculated COP, or null if out of the model's valid range.
 */
function getCOP(data, targetFlowTemp, targetAmbientTemp, targetOutput) {
    const modelData = data["5kW"]; // Assuming "5kW" model
    const flowTemps = Object.keys(modelData)
        .filter(k => k.endsWith('C'))
        .map(k => parseInt(k))
        .sort((a, b) => a - b);
    
    const ambientTemps = modelData.ambient;

    // MODIFIED SECTION FOR EXTRAPOLATION
    // --- 1. Find bracketing Flow Temperatures ---
    let flow1_temp, flow2_temp;

    // Handle extrapolation below the minimum temperature
    if (targetFlowTemp < flowTemps[0]) {
        flow1_temp = flowTemps[0]; // e.g., 35
        flow2_temp = flowTemps[1]; // e.g., 45
    // Handle extrapolation above the maximum temperature
    } else if (targetFlowTemp > flowTemps[flowTemps.length - 1]) {
        flow1_temp = flowTemps[flowTemps.length - 2]; // e.g., 55
        flow2_temp = flowTemps[flowTemps.length - 1]; // e.g., 65
    // Handle interpolation within the range (original logic)
    } else {
        for (let i = 0; i < flowTemps.length - 1; i++) {
            if (targetFlowTemp >= flowTemps[i] && targetFlowTemp <= flowTemps[i + 1]) {
                flow1_temp = flowTemps[i];
                flow2_temp = flowTemps[i + 1];
                break;
            }
        }
    }
    // If the target is an exact match on the boundary, prevent issues
    if (targetFlowTemp === flowTemps[0] || targetFlowTemp === flowTemps[flowTemps.length - 1]) {
        flow2_temp = flow1_temp;
    }

    // --- 2. Find bracketing Ambient Temperatures ---
    let ambient1_idx, ambient2_idx;
    if (targetAmbientTemp <= ambientTemps[0]) {
        ambient1_idx = ambient2_idx = 0;
    } else if (targetAmbientTemp >= ambientTemps[ambientTemps.length - 1]) {
        ambient1_idx = ambient2_idx = ambientTemps.length - 1;
    } else {
        for (let i = 0; i < ambientTemps.length - 1; i++) {
            if (targetAmbientTemp >= ambientTemps[i] && targetAmbientTemp <= ambientTemps[i + 1]) {
                ambient1_idx = i;
                ambient2_idx = i + 1;
                break;
            }
        }
    }
    
    // --- 3. Perform the interpolation ---
    
    // Get COP for the lower flow temperature slice
    const flow1_data = modelData[`${flow1_temp}C`];
    const cop_a1_f1 = interpolateForOutput(flow1_data, ambient1_idx, targetOutput);
    const cop_a2_f1 = interpolateForOutput(flow1_data, ambient2_idx, targetOutput);
    
    if (cop_a1_f1 === null || cop_a2_f1 === null) return null; // Cannot interpolate this slice
    
    const cop_f1 = linearInterp(
        targetAmbientTemp, 
        ambientTemps[ambient1_idx], cop_a1_f1, 
        ambientTemps[ambient2_idx], cop_a2_f1
    );

    // If no flow interpolation is needed, we're done
    if (flow1_temp === flow2_temp) return cop_f1;

    // Get COP for the higher flow temperature slice
    const flow2_data = modelData[`${flow2_temp}C`];
    const cop_a1_f2 = interpolateForOutput(flow2_data, ambient1_idx, targetOutput);
    const cop_a2_f2 = interpolateForOutput(flow2_data, ambient2_idx, targetOutput);

    if (cop_a1_f2 === null || cop_a2_f2 === null) return null; // Cannot interpolate this slice

    const cop_f2 = linearInterp(
        targetAmbientTemp, 
        ambientTemps[ambient1_idx], cop_a1_f2, 
        ambientTemps[ambient2_idx], cop_a2_f2
    );
    
    // Final interpolation across flow temperatures
    return linearInterp(targetFlowTemp, flow1_temp, cop_f1, flow2_temp, cop_f2);
}



// Example 2: A point that lies on a specific flow temperature plane.
// Target: Flow=55°C, Ambient=0°C, Output=4.0kW
let cop2 = getCOP(vaillant_data, 65, 10, 4.0);
console.log(`COP at 55°C flow, 12°C ambient, 4.2kW output: ${cop2.toFixed(2)}`);
