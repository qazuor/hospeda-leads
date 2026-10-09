"use client";

import { Toaster as Sonner } from "sonner";
import {useMediaQuery} from "@mantine/hooks";
import styles from "./SonnerToaster.module.css";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * This is already included in the global context providers so should not be rendered again.
 */
export const SonnerToaster = ({ className, ...props }: ToasterProps) => {
  const mobile=useMediaQuery("(max-width:600px)",false,{getInitialValueInEffect:false});
  return (
    <Sonner
      position="bottom-right"
      mobileOffset={{top:12,left:12,right:12,bottom:12}}
      visibleToasts={mobile?1:3}
      closeButton
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
