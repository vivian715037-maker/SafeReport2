/** 호스팅에서도 원본의 JPEG/PNG/WebP 업로드를 제공하기 위해 브라우저에서 안전한 JPEG로 재인코딩합니다. */
export async function prepareImage(file:File):Promise<Blob>{
 // 1. 원본 용량·형식을 먼저 확인하고 브라우저의 이미지 디코더로 실제 사진인지 확인합니다.
 if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('10MB 이하 JPEG, PNG, WebP 사진을 선택하세요.');
 const bitmap=await createImageBitmap(file);
 try{
 // 2. 최대 1600픽셀로 줄이고 Canvas를 통해 메타데이터를 제외한 픽셀만 복사합니다.
 const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');if(!ctx)throw Error('이 브라우저에서 사진을 처리하지 못했습니다.');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 // 3. 서버에서도 JPEG를 검증·재인코딩하며 공개 여부는 별도 동의로 관리합니다.
 return await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error('사진을 변환하지 못했습니다.')),'image/jpeg',.88));
 }finally{bitmap.close();}
}
