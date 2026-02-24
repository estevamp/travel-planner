import { motion } from "motion/react";

export function SettingsTab(props: any) {
  return (
    <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <p>Settings Tab - To be implemented</p>
    </motion.div>
  );
}
