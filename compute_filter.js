// Quick script to approximate filter values for #5422b0
// Using known formula: filter converts black (#000) to target color
// We'll brute-force search for parameters that produce closest match
// Not perfect but gives us a starting point

const target = { r: 84, g: 34, b: 176 };

function applyFilter(r, g, b, invert, sepia, saturate, hueRotate, brightness, contrast) {
    // Simplified filter simulation (not accurate)
    // This is just for approximation
    let rgb = [r/255, g/255, b/255];
    
    // invert
    rgb = rgb.map(v => invert ? (1 - v) * invert/100 + v * (1 - invert/100) : v);
    
    // sepia
    if (sepia) {
        const rv = rgb[0] * 0.393 + rgb[1] * 0.769 + rgb[2] * 0.189;
        const gv = rgb[0] * 0.349 + rgb[1] * 0.686 + rgb[2] * 0.168;
        const bv = rgb[0] * 0.272 + rgb[1] * 0.534 + rgb[2] * 0.131;
        rgb = [
            rv * sepia/100 + rgb[0] * (1 - sepia/100),
            gv * sepia/100 + rgb[1] * (1 - sepia/100),
            bv * sepia/100 + rgb[2] * (1 - sepia/100)
        ];
    }
    
    // saturate
    if (saturate) {
        // simplified
        const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
        rgb = rgb.map(v => avg + (v - avg) * saturate/100);
    }
    
    // hue-rotate (simplified)
    if (hueRotate) {
        // convert to HSL, rotate, convert back - skip for now
    }
    
    // brightness
    if (brightness) rgb = rgb.map(v => v * brightness/100);
    
    // contrast
    if (contrast) {
        const factor = (contrast/100);
        rgb = rgb.map(v => (v - 0.5) * factor + 0.5);
    }
    
    // clamp
    rgb = rgb.map(v => Math.max(0, Math.min(1, v)));
    return rgb.map(v => Math.round(v * 255));
}

// Test current filter
const current = applyFilter(0,0,0, 15,95,4500,260,85,95);
console.log('Current filter produces:', current);
console.log('Target:', target);

// Compute difference
function diff(a,b) {
    return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]);
}
console.log('Difference:', diff(current, target));

// Try some adjustments
console.log('\nTrying adjustments:');
const tests = [
    { invert: 15, sepia: 95, saturate: 4500, hueRotate: 260, brightness: 85, contrast: 95 },
    { invert: 20, sepia: 95, saturate: 4000, hueRotate: 260, brightness: 85, contrast: 95 },
    { invert: 10, sepia: 95, saturate: 5000, hueRotate: 260, brightness: 85, contrast: 95 },
    { invert: 15, sepia: 95, saturate: 4500, hueRotate: 250, brightness: 85, contrast: 95 },
    { invert: 15, sepia: 95, saturate: 4500, hueRotate: 270, brightness: 85, contrast: 95 },
    { invert: 15, sepia: 95, saturate: 4500, hueRotate: 260, brightness: 80, contrast: 95 },
    { invert: 15, sepia: 95, saturate: 4500, hueRotate: 260, brightness: 90, contrast: 95 },
    { invert: 15, sepia: 95, saturate: 4500, hueRotate: 260, brightness: 85, contrast: 90 },
    { invert: 15, sepia: 95, saturate: 4500, hueRotate: 260, brightness: 85, contrast: 100 },
];

tests.forEach((t, i) => {
    const res = applyFilter(0,0,0, t.invert, t.sepia, t.saturate, t.hueRotate, t.brightness, t.contrast);
    console.log(`Test ${i}:`, res, 'diff', diff(res, target));
});