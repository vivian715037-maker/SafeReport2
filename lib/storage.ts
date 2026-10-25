/** 비공개 R2 사진 저장소. 파일 경로는 서버가 생성한 UUID만 사용하며 공개 읽기는 API 권한 검사 후에만 수행합니다. */
import {env} from 'cloudflare:workers';
export async function saveImage(name:string,bytes:Uint8Array){await env.BUCKET!.put(name,bytes,{httpMetadata:{contentType:'image/jpeg'}});}
export async function loadImage(name:string){const object=await env.BUCKET!.get(name);if(!object)throw Error('사진을 찾지 못했습니다.');return Buffer.from(await object.arrayBuffer());}
export async function deleteImage(name:string){await env.BUCKET!.delete(name);}
