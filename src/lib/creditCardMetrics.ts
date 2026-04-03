import type { CCStatement, CreditCard } from '@/hooks/useCreditCards';

export function getStatementCreditLimit(statement: Pick<CCStatement, 'available_credit_limit' | 'outstanding_balance'>, card?: Pick<CreditCard, 'credit_limit'>) {
  const derivedLimit = (statement.outstanding_balance || 0) + (statement.available_credit_limit || 0);
  return card?.credit_limit || derivedLimit || 0;
}

export function getStatementOutstanding(statement: Pick<CCStatement, 'available_credit_limit' | 'outstanding_balance'>, card?: Pick<CreditCard, 'credit_limit'>) {
  const creditLimit = getStatementCreditLimit(statement, card);
  if (creditLimit > 0) {
    return Math.max(0, creditLimit - (statement.available_credit_limit || 0));
  }
  return statement.outstanding_balance || 0;
}

export function getStatementUtilization(statement: Pick<CCStatement, 'available_credit_limit' | 'outstanding_balance'>, card?: Pick<CreditCard, 'credit_limit'>) {
  const creditLimit = getStatementCreditLimit(statement, card);
  const outstanding = getStatementOutstanding(statement, card);
  return creditLimit > 0 ? (outstanding / creditLimit) * 100 : 0;
}
