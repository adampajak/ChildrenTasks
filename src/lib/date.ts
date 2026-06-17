export function getTodayLocal(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}
