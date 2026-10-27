export const maeveEase = [0.22, 1, 0.36, 1] as const
export const luxEase = [0.16, 1, 0.3, 1] as const

export const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1, delay, ease: luxEase },
  }),
}

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: (delay = 0) => ({
    opacity: 1,
    transition: { duration: 1.2, delay, ease: luxEase },
  }),
}

export const scaleReveal = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: (delay = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 1.2, delay, ease: luxEase },
  }),
}

export const clipReveal = {
  hidden: { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
  visible: (delay = 0) => ({
    opacity: 1,
    clipPath: 'inset(0 0 0% 0)',
    transition: { duration: 1.2, delay, ease: luxEase },
  }),
}

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.08 },
  },
}