var vaillant_data = {
    "5kW": {
        // Columns 
        "speed": [120, 110, 97, 90, 80, 70, 60, 50, 40, 30],
        // Rows
        "ambient": [-20, -15, -12, -7, -2, 0, 2, 7, 10, 12, 15, 20],
    
        "35C": { // 35-30
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

/*
 * Helper function for 1D linear interpolation.
 * x: the value to interpolate for
 * x0, y0: a known point (x0, y0)
 * x1, y1: a second known point (x1, y1)
 * Returns the interpolated value y.
 */
function linearInterpolation(x, x0, y0, x1, y1) {
    if (x0 === x1) return y0; // Should not happen with well-formed data
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

/*
 * Interpolates the COP for a given set of conditions.
 *
 * @param {object} data - The Vaillant data structure.
 * @param {number} outletTemp - The desired outlet temperature (e.g., 40).
 * @param {number} ambientTemp - The desired ambient temperature (e.g., 5).
 * @param {number} output - The desired heat pump output (e.g., 4.5).
 * @returns {number|null} The interpolated COP or null if out of bounds/data missing.
 */
function interpolateCOP(data, outletTemp, ambientTemp, output) {
    const modelData = data["5kW"];
    const speeds = modelData.speed;
    const ambients = modelData.ambient;
    const tempKeys = ["35C", "45C", "55C", "65C"]; // Sorted outlet temperatures

    // 1. DETERMINE BRACKETING OUTLET TEMPERATURES
    // Find the two table temperatures (T_low and T_high) that bracket the requested outletTemp.
    let t_low_key = null;
    let t_high_key = null;

    for (let i = 0; i < tempKeys.length; i++) {
        const currentTemp = parseInt(tempKeys[i].replace('C', ''));
        if (currentTemp <= outletTemp) {
            t_low_key = tempKeys[i];
        }
        if (currentTemp >= outletTemp) {
            t_high_key = tempKeys[i];
            break;
        }
    }

    if (!t_low_key) {
        // If below the lowest data point, use the lowest one (35C)
        t_low_key = "35C";
        t_high_key = "35C";
    } else if (!t_high_key) {
        // If above the highest data point, use the highest one (65C)
        t_low_key = "65C";
        t_high_key = "65C";
    }
    
    // Helper function to get the interpolated COP from a single 2D table
    function getCOPFromTable(tableKey, targetAmbient, targetOutput) {
        const table = modelData[tableKey];
        if (!table) return null;

        const cops = table.cop;
        const outputs = table.output;
        
        // Find bracketing ambient temperatures
        let a_low_index = -1;
        let a_high_index = -1;

        // Note: The data rows are sorted by ambient.
        for (let i = 0; i < ambients.length; i++) {
            if (ambients[i] <= targetAmbient) {
                a_low_index = i;
            }
            if (ambients[i] >= targetAmbient) {
                a_high_index = i;
                break;
            }
        }
        
        // Handle out-of-bounds ambient temperatures
        if (a_low_index === -1) a_low_index = a_high_index;
        if (a_high_index === -1) a_high_index = a_low_index;

        if (a_low_index === -1 || a_high_index === -1) return null; // No relevant data found
        
        const a_low = ambients[a_low_index];
        const a_high = ambients[a_high_index];
        
        // Find COP at targetOutput for a_low and a_high
        let cop_low = interpolateForOutput(outputs[a_low_index], cops[a_low_index], targetOutput, speeds);
        let cop_high = interpolateForOutput(outputs[a_high_index], cops[a_high_index], targetOutput, speeds);
        
        if (cop_low === null && cop_high === null) return null;
        if (cop_low === null) cop_low = cop_high;
        if (cop_high === null) cop_high = cop_low;

        if (cop_low === null) return null; // Still null, no data to work with
        
        // 2. INTERPOLATE AMBIENT TEMPERATURE (Bilinear step 1)
        if (a_low === a_high) {
            return cop_low; // Exact ambient match
        }
        
        // Linear interpolation between the two ambient results
        return linearInterpolation(targetAmbient, a_low, cop_low, a_high, cop_high);
    }
    
    // Helper function for 1D interpolation across the speed/output dimension
    function interpolateForOutput(outputRow, copRow, targetOutput, speeds) {
        // Output and COP are sorted by speed, but Output is not strictly monotonic
        // across the whole range, though it should be *per ambient row*.
        
        let p1_index = -1;
        let p2_index = -1;
        
        // Find the bracketing output values (p1 and p2)
        // Since output is mostly decreasing with speed, we check in reverse
        for (let i = speeds.length - 1; i >= 0; i--) {
            if (outputRow[i] !== null) {
                if (outputRow[i] <= targetOutput) {
                    p1_index = i; // Low output/high speed
                }
                if (outputRow[i] >= targetOutput) {
                    p2_index = i; // High output/low speed
                    break; // Found high point, exit loop
                }
            }
        }
        
        if (p1_index === -1 && p2_index === -1) return null; // No data points
        
        if (p1_index === -1) p1_index = p2_index; // If below the lowest output, use the lowest point
        if (p2_index === -1) p2_index = p1_index; // If above the highest output, use the highest point
        
        if (outputRow[p1_index] === outputRow[p2_index]) {
            return copRow[p1_index]; // Exact output match or single data point
        }
        
        // Linear interpolation: interpolate COP based on OUTPUT
        return linearInterpolation(
            targetOutput, 
            outputRow[p1_index], 
            copRow[p1_index], 
            outputRow[p2_index], 
            copRow[p2_index]
        );
    }

    // 3. INTERPOLATE OUTLET TEMPERATURE (Final step for 3D interpolation)
    const t_low = parseInt(t_low_key.replace('C', ''));
    const t_high = parseInt(t_high_key.replace('C', ''));

    // Get the interpolated COP at the two bracketing table temperatures
    const cop_at_t_low = getCOPFromTable(t_low_key, ambientTemp, output);
    const cop_at_t_high = getCOPFromTable(t_high_key, ambientTemp, output);

    if (cop_at_t_low === null && cop_at_t_high === null) return null;
    if (cop_at_t_low === null) return cop_at_t_high;
    if (cop_at_t_high === null) return cop_at_t_low;

    if (t_low === t_high) {
        return cop_at_t_low; // Exact outlet temperature match
    }

    // Final linear interpolation between the two outlet temperature results
    return linearInterpolation(outletTemp, t_low, cop_at_t_low, t_high, cop_at_t_high);
}

// Example Usage: Find COP at 40C Outlet, 5C Ambient, 4.5kW Output
const desiredOutlet = 40;
const desiredAmbient = 5;
const desiredOutput = 4.5;

const interpolatedResult = interpolateCOP(vaillant_data, desiredOutlet, desiredAmbient, desiredOutput);
console.log(`Interpolated COP for 40C outlet, 5C ambient, 4.5kW output: ${interpolatedResult.toFixed(2)}`);

// Example Usage: Find COP at 35C Outlet, 0C Ambient, 5.4kW Output (Should be close to 3.4)
const result2 = interpolateCOP(vaillant_data, 35, 0, 5.4);
console.log(`Interpolated COP for 35C outlet, 0C ambient, 5.4kW output: ${result2.toFixed(2)}`);