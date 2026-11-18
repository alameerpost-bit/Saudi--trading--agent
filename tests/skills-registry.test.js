import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const registry=JSON.parse(readFileSync(new URL('../skills/registry.json',import.meta.url),'utf8'));
test('exactly 11 unique skills are registered',()=>{assert.equal(registry.skills.length,11);assert.equal(new Set(registry.skills.map(x=>x.id)).size,11);});
test('all skills and trading capabilities remain disabled',()=>{assert.ok(registry.skills.every(x=>x.enabled===false));assert.equal(registry.safety.tradingEnabled,false);assert.equal(registry.safety.brokerOrdersEnabled,false);assert.equal(registry.safety.automaticExecution,false);});
test('stale or unverified data cannot produce entry signals',()=>{assert.equal(registry.safety.allowEntrySignalsWithStaleOrUnverifiedData,false);assert.equal(registry.safety.requireUserApproval,true);});
