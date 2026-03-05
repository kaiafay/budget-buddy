export type Transaction = {
  id: string
  label: string
  amount: number
  type: 'income' | 'expense'
  date: string // YYYY-MM-DD
  category: string
  recurring: boolean
  frequency?: 'weekly' | 'biweekly' | 'monthly' | 'yearly'
}

export type Settings = {
  accountName: string
  startingBalance: number
}

export const mockSettings: Settings = {
  accountName: 'Main Checking',
  startingBalance: 3250.00,
}

export const mockTransactions: Transaction[] = [
  // March 2026
  { id: '1', label: 'Salary', amount: 4200, type: 'income', date: '2026-03-01', category: 'salary', recurring: true, frequency: 'monthly' },
  { id: '2', label: 'Rent', amount: 1500, type: 'expense', date: '2026-03-01', category: 'housing', recurring: true, frequency: 'monthly' },
  { id: '3', label: 'Netflix', amount: 15.99, type: 'expense', date: '2026-03-02', category: 'entertainment', recurring: true, frequency: 'monthly' },
  { id: '4', label: 'Grocery Store', amount: 87.43, type: 'expense', date: '2026-03-03', category: 'groceries', recurring: false },
  { id: '5', label: 'Electric Bill', amount: 124.50, type: 'expense', date: '2026-03-05', category: 'utilities', recurring: true, frequency: 'monthly' },
  { id: '6', label: 'Coffee Shop', amount: 5.75, type: 'expense', date: '2026-03-06', category: 'food', recurring: false },
  { id: '7', label: 'Freelance Work', amount: 850, type: 'income', date: '2026-03-07', category: 'freelance', recurring: false },
  { id: '8', label: 'Gas Station', amount: 45.20, type: 'expense', date: '2026-03-08', category: 'transport', recurring: false },
  { id: '9', label: 'Gym Membership', amount: 49.99, type: 'expense', date: '2026-03-10', category: 'health', recurring: true, frequency: 'monthly' },
  { id: '10', label: 'Amazon Purchase', amount: 32.99, type: 'expense', date: '2026-03-11', category: 'shopping', recurring: false },
  { id: '11', label: 'Lunch with Team', amount: 18.50, type: 'expense', date: '2026-03-12', category: 'food', recurring: false },
  { id: '12', label: 'Phone Bill', amount: 85, type: 'expense', date: '2026-03-13', category: 'utilities', recurring: true, frequency: 'monthly' },
  { id: '13', label: 'Side Project Payment', amount: 400, type: 'income', date: '2026-03-15', category: 'freelance', recurring: false },
  { id: '14', label: 'Grocery Store', amount: 112.30, type: 'expense', date: '2026-03-15', category: 'groceries', recurring: false },
  { id: '15', label: 'Car Insurance', amount: 175, type: 'expense', date: '2026-03-16', category: 'insurance', recurring: true, frequency: 'monthly' },
  { id: '16', label: 'Spotify', amount: 9.99, type: 'expense', date: '2026-03-17', category: 'entertainment', recurring: true, frequency: 'monthly' },
  { id: '17', label: 'Dinner Out', amount: 62.40, type: 'expense', date: '2026-03-18', category: 'food', recurring: false },
  { id: '18', label: 'Internet Bill', amount: 79.99, type: 'expense', date: '2026-03-20', category: 'utilities', recurring: true, frequency: 'monthly' },
  { id: '19', label: 'Grocery Store', amount: 65.80, type: 'expense', date: '2026-03-22', category: 'groceries', recurring: false },
  { id: '20', label: 'Uber Ride', amount: 24.50, type: 'expense', date: '2026-03-23', category: 'transport', recurring: false },
  { id: '21', label: 'Clothing Store', amount: 89.99, type: 'expense', date: '2026-03-25', category: 'shopping', recurring: false },
  { id: '22', label: 'Pharmacy', amount: 22.15, type: 'expense', date: '2026-03-27', category: 'health', recurring: false },
  { id: '23', label: 'Grocery Store', amount: 94.60, type: 'expense', date: '2026-03-28', category: 'groceries', recurring: false },
  { id: '24', label: 'Movie Tickets', amount: 28, type: 'expense', date: '2026-03-29', category: 'entertainment', recurring: false },

  // February 2026
  { id: '25', label: 'Salary', amount: 4200, type: 'income', date: '2026-02-01', category: 'salary', recurring: true, frequency: 'monthly' },
  { id: '26', label: 'Rent', amount: 1500, type: 'expense', date: '2026-02-01', category: 'housing', recurring: true, frequency: 'monthly' },
  { id: '27', label: 'Grocery Store', amount: 78.90, type: 'expense', date: '2026-02-04', category: 'groceries', recurring: false },
  { id: '28', label: 'Electric Bill', amount: 135.20, type: 'expense', date: '2026-02-05', category: 'utilities', recurring: true, frequency: 'monthly' },
  { id: '29', label: 'Valentine Dinner', amount: 145, type: 'expense', date: '2026-02-14', category: 'food', recurring: false },
  { id: '30', label: 'Freelance Work', amount: 600, type: 'income', date: '2026-02-20', category: 'freelance', recurring: false },

  // April 2026
  { id: '31', label: 'Salary', amount: 4200, type: 'income', date: '2026-04-01', category: 'salary', recurring: true, frequency: 'monthly' },
  { id: '32', label: 'Rent', amount: 1500, type: 'expense', date: '2026-04-01', category: 'housing', recurring: true, frequency: 'monthly' },
  { id: '33', label: 'Tax Filing Service', amount: 250, type: 'expense', date: '2026-04-10', category: 'services', recurring: false },
  { id: '34', label: 'Tax Refund', amount: 1830, type: 'income', date: '2026-04-15', category: 'salary', recurring: false },
]

export function getTransactionsForDate(date: string): Transaction[] {
  return mockTransactions.filter(t => t.date === date)
}

export function getTransactionsForMonth(year: number, month: number): Transaction[] {
  const monthStr = String(month).padStart(2, '0')
  const prefix = `${year}-${monthStr}`
  return mockTransactions.filter(t => t.date.startsWith(prefix))
}

export function getDailyBalance(year: number, month: number): Map<number, number> {
  const balances = new Map<number, number>()
  let runningBalance = mockSettings.startingBalance

  // Get all transactions up to end of the target month, sorted by date
  const allSorted = [...mockTransactions].sort((a, b) => a.date.localeCompare(b.date))

  const targetMonth = String(month).padStart(2, '0')
  const targetPrefix = `${year}-${targetMonth}`

  // First, sum up all transactions before the target month
  for (const t of allSorted) {
    if (t.date < targetPrefix) {
      runningBalance += t.type === 'income' ? t.amount : -t.amount
    }
  }

  // Now compute daily balances for the target month
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthTransactions = allSorted.filter(t => t.date.startsWith(targetPrefix))

  let txIdx = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${targetPrefix}-${String(day).padStart(2, '0')}`
    while (txIdx < monthTransactions.length && monthTransactions[txIdx].date === dayStr) {
      const t = monthTransactions[txIdx]
      runningBalance += t.type === 'income' ? t.amount : -t.amount
      txIdx++
    }
    balances.set(day, Math.round(runningBalance * 100) / 100)
  }

  return balances
}

export const categoryIcons: Record<string, string> = {
  salary: 'Banknote',
  housing: 'Home',
  entertainment: 'Tv',
  groceries: 'ShoppingCart',
  utilities: 'Zap',
  food: 'UtensilsCrossed',
  freelance: 'Laptop',
  transport: 'Car',
  health: 'Heart',
  shopping: 'ShoppingBag',
  insurance: 'Shield',
  services: 'FileText',
}
