"use client";

/**
 * 로컬 저장용 IndexedDB 핸들 (자재·프로젝트 공용).
 *
 * 두 모듈이 각자 openDB 를 부르면 버전이 어긋나 VersionError 가 난다 —
 * 스키마와 열기를 여기 한 곳에서만 관리한다.
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "project90-local";
/** 1: materials · 2: projects 추가 */
const DB_VERSION = 2;

export const MATERIALS_STORE = "materials";
export const PROJECTS_STORE = "projects";

let dbPromise: Promise<IDBPDatabase> | null = null;

export function localDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("이 브라우저는 로컬 저장(IndexedDB)을 지원하지 않습니다."));
  }
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(MATERIALS_STORE)) {
        database.createObjectStore(MATERIALS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
      }
    },
  });
  return dbPromise;
}
