import { translator, type Locale } from './i18n';
export type RuleResult = { state: 'allowed' | 'blocked'; evidence: string };
type Group = { agents: string[]; rules: { kind: string; pattern: string }[] };
export function robotsDecision(text: string, agent: string, path: string, locale: Locale = 'en'): RuleResult {
  const t = translator(locale);
  const groups: Group[] = [];
  let group: Group | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).toLowerCase().trim(), value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.rules.length) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow','disallow'].includes(key)) group.rules.push({ kind: key, pattern: value });
  }
  const token = agent.toLowerCase();
  const specificity = (g: Group) => Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : token.includes(a) ? a.length : -1));
  const max = Math.max(-1, ...groups.map(specificity));
  if (max < 0) return { state: 'allowed', evidence: t("No hay una regla aplicable a este agente.") };
  const rules = groups.filter(g => specificity(g) === max).flatMap(g => g.rules).filter(rule => {
    if (!rule.pattern) return false;
    const pattern = rule.pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try { return new RegExp('^' + pattern).test(path); } catch { return false; }
  }).sort((a,b) => b.pattern.replace(/\*/g,'').length - a.pattern.replace(/\*/g,'').length || (a.kind === 'allow' ? -1 : 1));
  const rule = rules[0];
  return { state: rule?.kind === 'disallow' ? 'blocked' : 'allowed', evidence: rule ? `${rule.kind === 'allow' ? 'Allow' : 'Disallow'}: ${rule.pattern}` : t("Ninguna restricción coincide con esta ruta.") };
}
