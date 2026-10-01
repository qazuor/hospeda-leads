import * as Tabs from '@radix-ui/react-tabs';
import styles from './SectionTabs.module.css';

export const SectionTabs = ({className, ...props}: React.ComponentProps<typeof Tabs.Root>) =>
  <Tabs.Root {...props} className={[styles.root,className].filter(Boolean).join(' ')}/>;
export const SectionTab = ({children, ...props}: React.ComponentProps<typeof Tabs.Trigger>) =>
  <Tabs.Trigger {...props} className={styles.tab}>{children}</Tabs.Trigger>;
export const SectionTabList = ({children, ...props}: React.ComponentProps<typeof Tabs.List>) =>
  <Tabs.List {...props} className={styles.list}>{children}</Tabs.List>;
export const SectionTabPanel = ({children, ...props}: React.ComponentProps<typeof Tabs.Content>) =>
  <Tabs.Content {...props} className={styles.content}>{children}</Tabs.Content>;
