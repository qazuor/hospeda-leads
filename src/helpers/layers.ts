/**
 * The app's z-index scale in one place, so floating layers cannot drift apart. Dialogs stack from `dialogBase` upwards (two
 * steps per open dialog: overlay and content), menus, pickers and tooltips sit above the first dialog, and toasts sit above
 * everything, including any number of stacked dialogs.
 */
export const LAYERS={commandPalette:410,dialogBase:410,dialogStep:2,popover:430,combobox:435,menu:440,tooltip:450,toast:10000} as const;

/** Highest z-index a dialog layer may take; stacked dialogs are clamped here so toasts always stay on top. */
export const DIALOG_LAYER_MAX=LAYERS.toast-LAYERS.dialogStep;

/**
 * z-index of the dialog at `index` in the open-dialog stack (0 = first one opened).
 * @param input.index position in the stack; negative values (not tracked yet) count as the first layer.
 * @returns the z-index, clamped below the toaster.
 */
export function dialogZIndex({index}:{index:number}):{zIndex:number}{
 return {zIndex:Math.min(DIALOG_LAYER_MAX,LAYERS.dialogBase+Math.max(0,index)*LAYERS.dialogStep)};
}
