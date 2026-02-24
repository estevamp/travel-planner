import { motion } from "motion/react";

export function ExpensesTab(props: any) {
  return (
    <motion.div key="expenses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <p>Expenses Tab - To be implemented</p>
    </motion.div>
  );
}
