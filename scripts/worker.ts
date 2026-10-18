import 'dotenv/config';
import { runNextJob } from '../src/lib/server/jobs';
import { db } from '../src/lib/server/db';
let stopping=false;
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
async function main(){
  console.log('Acolhe+ worker iniciado.');
  while(!stopping){
    try { if(!await runNextJob()) await new Promise(r=>setTimeout(r,2000)); }
    catch(error){ console.error(error); await new Promise(r=>setTimeout(r,5000)); }
  }
}
main().finally(()=>db.$disconnect());
