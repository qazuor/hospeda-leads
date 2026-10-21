import {calendarDay} from './workDates';
/** Shown when the server refuses an edit because the task changed after the editor loaded it (409); nothing was saved. */
export const TASK_SAVE_CONFLICT_MESSAGE='No se guardó: otra persona cambió esta tarea mientras la editabas. Lo que escribiste sigue acá. Podés copiarlo y cargar la versión más reciente para revisarla.';
/** An edit sent without the version the editor loaded (for example, from a page opened before an update). */
export const TASK_SAVE_STALE_PAGE_MESSAGE='Recargá la página para guardar los cambios de esta tarea.';
/** The version token of a task as the client sends it back in `expectedUpdatedAt`. */
export const taskVersion=(updatedAt:Date|string|null|undefined):string|undefined=>updatedAt?new Date(updatedAt).toISOString():undefined;
/** True when the stored version is the one the editor loaded. Both sides go through the same driver parsing, so millisecond equality is exact. */
export const sameTaskVersion=(stored:Date,expected:string)=>stored.getTime()===new Date(expected).getTime();
/** The editable fields of a task, as stored and as `task_save` writes them. */
export type TaskEditableFields={readonly title:string;readonly purpose:string|null;readonly description:string|null;readonly typeId:string;readonly assignedUserEmail:string|null;readonly dueDate:unknown;readonly dueAt:Date|null;readonly priority:string;readonly participants:string;readonly contactIds:unknown};
/**
 * True when the stored task already holds exactly what the edit asks for. A stale edit that matches is a retry whose answer was lost
 * (the first attempt was applied), so it succeeds without writing instead of answering a conflict.
 */
export function taskAlreadySaved({stored,requested}:{stored:TaskEditableFields;requested:TaskEditableFields}):boolean{
 return stored.title===requested.title&&(stored.purpose??null)===(requested.purpose??null)&&(stored.description??null)===(requested.description??null)&&stored.typeId===requested.typeId&&(stored.assignedUserEmail??null)===(requested.assignedUserEmail??null)&&calendarDay(stored.dueDate)===calendarDay(requested.dueDate)&&(stored.dueAt?.getTime()??null)===(requested.dueAt?.getTime()??null)&&stored.priority===requested.priority&&stored.participants===requested.participants&&JSON.stringify(stored.contactIds)===JSON.stringify(requested.contactIds);
}
