import { motion } from "motion/react";

export function DocumentsTab(props: any) {
  return (
    <motion.div key="documents" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <p>Documents Tab - To be implemented</p>
    </motion.div>
  );
}
