/* What the user has typed into "New check", kept while they move between pages. */
import type { CheckType } from '@siyasat/core';
import { create } from 'zustand';

export interface FormDraft {
  name: string;
  input: string;
  refsIn: string;
}

/** The library export loaded into the "Review corpus" form. */
export interface CorpusFile {
  file: string;
  sizeLabel: string;
  /** The check's name was filled in from the file name, so it follows the file when the file changes. */
  autoName: string | null;
}

export interface Editing {
  id: string;
  name: string;
  input: string;
  refsIn: string;
}

interface FormsState {
  type: CheckType;
  forms: Record<CheckType, FormDraft>;
  corpusFile: CorpusFile | null;
  /** The saved draft check being edited, when "Edit draft" was used. */
  editing: Editing | null;
  /** A draft check is running; the form must not be thrown away. */
  draftRunning: boolean;
}

const empty = (): FormDraft => ({ name: '', input: '', refsIn: '' });
const blank = (): Pick<FormsState, 'forms' | 'corpusFile' | 'editing'> => ({
  forms: { refs: empty(), corpus: empty(), draft: empty() },
  corpusFile: null,
  editing: null,
});

export const useForms = create<FormsState>(() => ({ type: 'refs', draftRunning: false, ...blank() }));

export const setFormType = (type: CheckType): void => useForms.setState({ type });

export const setForm = (type: CheckType, patch: Partial<FormDraft>): void =>
  useForms.setState((s) => ({ forms: { ...s.forms, [type]: { ...s.forms[type], ...patch } } }));

export const setCorpusFile = (corpusFile: CorpusFile | null): void => useForms.setState({ corpusFile });

/** "Start over": forget everything typed, and go back to the first kind of check. */
export const resetForms = (): void => useForms.setState({ type: 'refs', ...blank() });

export const startEditing = (editing: Editing): void =>
  useForms.setState((s) => ({
    type: 'draft',
    editing,
    forms: { ...s.forms, draft: { name: editing.name, input: editing.input, refsIn: editing.refsIn } },
  }));

/** Leave edit mode and clear the draft form. */
export const stopEditing = (): void => useForms.setState((s) => ({ editing: null, forms: { ...s.forms, draft: empty() } }));
