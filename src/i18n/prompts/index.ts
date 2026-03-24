import type { Locale } from '../types.js';
import * as ko from './ko.js';
import * as en from './en.js';

interface PromptSet {
  workflowRules: string;
  parameterMapping: string;
  responseFormat: string;
  toolGuidelines: Record<string, string>;
  defaultToolGuideline: string;
  summarizerIntro: string;
  summarizerCommonRules: string;
  summarizerCautions: string;
  summarizerClosing: string;
  generalResponseClosing: string;
}

const promptSets: Record<Locale, PromptSet> = { ko, en };

export function getWorkflowRules(locale: Locale): string {
  return promptSets[locale].workflowRules;
}

export function getParameterMapping(locale: Locale): string {
  return promptSets[locale].parameterMapping;
}

export function getResponseFormat(locale: Locale): string {
  return promptSets[locale].responseFormat;
}

export function getToolGuidelines(locale: Locale, toolName: string): string {
  return promptSets[locale].toolGuidelines[toolName] ?? promptSets[locale].defaultToolGuideline;
}

export function getSummarizerIntro(locale: Locale): string {
  return promptSets[locale].summarizerIntro;
}

export function getSummarizerCommonRules(locale: Locale): string {
  return promptSets[locale].summarizerCommonRules;
}

export function getSummarizerCautions(locale: Locale): string {
  return promptSets[locale].summarizerCautions;
}

export function getSummarizerClosing(locale: Locale): string {
  return promptSets[locale].summarizerClosing;
}

export function getGeneralResponseClosing(locale: Locale): string {
  return promptSets[locale].generalResponseClosing;
}
