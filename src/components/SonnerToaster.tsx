"use client";

import { Toaster as Sonner } from "sonner";
import {useMediaQuery} from "@mantine/hooks";
import styles from "./SonnerToaster.module.css";
import {LAYERS} from "../helpers/layers";
import {useHasOpenDialog} from "../helpers/useDialogLayer";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * This is already included in the global context providers so should not be rendered again.
 */
export const SonnerToaster = ({ className, style, ...props }: ToasterProps) => {
  const mobile=useMediaQuery("(max-width:600px)",false,{getInitialValueInEffect:false});
  // Toasts sit above dialogs (LAYERS.toast). While one is open they move to the top centre so they never cover its footer,
  // where the primary actions live (side panels and centred dialogs alike); with no dialog they stay at the bottom right.
  // With one open they also hug the top edge (8px), above the dialog's header and close button instead of over them.
  const dialogOpen=useHasOpenDialog();
  return (
    <Sonner
      position={dialogOpen?"top-center":"bottom-right"}
      offset={dialogOpen?{top:8}:undefined}
      mobileOffset={{top:12,left:12,right:12,bottom:12}}
      visibleToasts={mobile?1:3}
      closeButton
      style={{...style,zIndex:LAYERS.toast}}
      className={`${styles.toaster} ${className ?? ""}`}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: styles.toast,
          content: styles.content,
          title: styles.title,
          actionButton: styles.actionButton,
          cancelButton: styles.cancelButton,
          closeButton: styles.closeButton,
          description: styles.description,
          icon: styles.icon,
        },
      }}
      {...props}
    />
  );
};
