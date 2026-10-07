export const WIDTHS = [155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285];
export const HEIGHTS = [40, 45, 50, 55, 60, 65, 70, 75, 80];
export const DIAMETERS = [13, 14, 15, 16, 17, 18, 19, 20];

/** "205/55 R16" */
export const tyreSizeLabel = (l: { width: number; height: number; diameter: number }) => `${l.width}/${l.height} R${l.diameter}`;
