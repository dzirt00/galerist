const fs = require('fs');
const path = require('path');
const out = __dirname;
const C = {felt:'#155054', ink:'#3D4038', muted:'#78796D', cream:'#EAE5D3', paper:'#F8F4E7', line:'#BBBBA4', sage:'#A1B5A5', olive:'#7D947B', dark:'#4C6257', gold:'#E0BC25', pink:'#A42E7E', blue:'#158BB0', orange:'#A24528', white:'#FFFFFF'};
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
let a=[];
const add=s=>a.push(s);
function rect(x,y,w,h,fill,r=0,stroke='none',sw=1){add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`)}
function text(x,y,s,size=14,color=C.ink,weight=400,font='Manrope, Arial, sans-serif',anchor='start'){add(`<text x="${x}" y="${y}" fill="${color}" font-family="${font}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`)}
const title=(x,y,s,size=28,color=C.ink)=>text(x,y,s,size,color,400,'Lora, Georgia, serif');
function line(x1,y1,x2,y2,color=C.line,sw=1){add(`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${sw}" fill="none"/>`)}
function circle(x,y,r,fill,stroke='none',sw=1){add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`)}
function pawn(x,y,color,scale=1){add(`<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="4" cy="25" rx="19" ry="7" fill="#283B35" opacity=".28"/><path d="M-16 19Q-8 5 -5 -24H5Q8 5 16 19Q17 28 0 29Q-17 28 -16 19" fill="${color}" stroke="#4D493D" stroke-opacity=".5"/><ellipse cy="-24" rx="7" ry="4" fill="${color}" stroke="#FFF9E6" stroke-opacity=".45"/><path d="M-12 20Q0 26 12 20M-10 16Q0 22 10 16M-8 11Q0 15 8 11M-5 -20L-9 8" fill="none" stroke="#FFF7D4" stroke-opacity=".25" stroke-width="1.2"/></g>`)}
function meeple(x,y,color,scale=.6){add(`<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="4" cy="19" rx="15" ry="5" fill="#283B35" opacity=".26"/><path d="M-5 -8Q-10 -20 0 -20Q10 -20 5 -8L15 -2L18 7L9 9L7 4L9 20H2L0 12L-2 20H-9L-7 4L-10 9L-18 7L-15 -2Z" fill="${color}" stroke="#605441" stroke-opacity=".55" stroke-width="1.2"/><path d="M-5 -8L-15 -1L-17 5M-6 5L-8 18" fill="none" stroke="#FFF8E2" stroke-opacity=".5" stroke-width="1.5"/></g>`)}
function people(x,y,colors,scale=.6){colors.forEach((c,i)=>meeple(x+i*23,y,c,scale))}
function coin(x,y,n){circle(x,y,14,C.gold,'#F4D990',2);circle(x,y,10,'none','#A57E32',1);text(x,y+4,n,11,C.ink,700,'Arial','middle')}
function button(x,y,w,label,primary=false){rect(x,y,w,42,primary?C.dark:C.paper,6,primary?C.dark:C.line);text(x+w/2,y+26,label,13,primary?C.paper:C.dark,600,undefined,'middle')}
function pill(x,y,w,label,fill=C.paper,color=C.ink){rect(x,y,w,28,fill,14);text(x+w/2,y+19,label,11,color,600,undefined,'middle')}
function ticket(x,y,color,n){rect(x,y,34,24,color,3);circle(x,y+12,4,C.cream);circle(x+34,y+12,4,C.cream);text(x+17,y+16,n,11,C.white,700,undefined,'middle')}
function art(x,y,w,h,variant=0){
  rect(x,y,w,h,['#EAD9B7','#C3CEBF','#CCAA95','#ADBFC5'][variant%4],1);
  add(`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 180 120" preserveAspectRatio="none">`);
  if(variant%4===0){add('<path d="M0 100Q60 10 180 80V120H0Z" fill="#40594B"/><path d="M0 86Q80 135 180 20V62Q70 160 0 112Z" fill="#B85E41"/><circle cx="124" cy="29" r="19" fill="#D4AE59"/><path d="M36 18V93M43 18V86" stroke="#F6EEDB" stroke-width="4"/>')}
  if(variant%4===1){add('<circle cx="89" cy="59" r="41" fill="#F0E9D8"/><path d="M31 120L72 0H100L59 120Z" fill="#3C5D53"/><path d="M85 120L128 0H147L107 120Z" fill="#BE7751"/><path d="M0 88H180" stroke="#293E36" stroke-width="3"/>')}
  if(variant%4===2){add('<rect x="23" y="20" width="61" height="83" fill="#6C4055"/><rect x="96" y="0" width="36" height="92" fill="#E9DABC"/><circle cx="106" cy="84" r="28" fill="#C28F40"/><path d="M0 105L180 37" stroke="#354C40" stroke-width="8"/>')}
  if(variant%4===3){add('<path d="M0 120L51 14L108 120Z" fill="#E5D5B2"/><circle cx="123" cy="43" r="31" fill="#42675D"/><path d="M0 108Q76 57 180 96V120H0Z" fill="#A2524C"/><path d="M14 25L164 101" stroke="#E7E7D3" stroke-width="3"/>')}
  add('</svg>');
}
function artcard(x,y,w,h,name,variant=0){
  rect(x+3,y+5,w,h,'#53574C',5);rect(x+2,y+3,w,h,'#D1CCBB',5,'#B8B5A6');rect(x,y,w,h,C.paper,5,'#D6CFBB');rect(x,y,w,h,'url(#paper)',5);rect(x+3,y+h-44,w-6,41,'url(#oak)',2);
  art(x+10,y+10,w-20,h-58,variant);text(x+12,y+h-31,name,w<140?8:12,C.ink,600);text(x+12,y+h-11,['Живопись','Живопись','Скульптура','Фотография'][variant%4],w<140?7:9,C.muted);
  if(w<140){circle(x+w-14,y+h-14,9,C.gold,'#F4D990',1);text(x+w-14,y+h-11,[8,11,14,17][variant%4],8,C.ink,700,undefined,'middle')}else{coin(x+w-24,y+h-23,[8,11,14,17][variant%4])}
}
function header(sub,second=false){
 rect(0,0,1440,1024,C.felt);rect(0,68,1440,956,'url(#felt)');rect(0,0,1440,68,'#EAE5D8');rect(0,0,1440,68,'url(#paper)');
 rect(24,17,34,34,C.dark,3);text(41,42,'Г',23,C.paper,400,'Georgia','middle');text(72,33,'ГАЛЕРИСТ',17,C.ink,700);text(73,50,'ЗАКРЫТАЯ АЛЬФА',8,C.muted,600);
 text(380,40,'Вечер в галерее',14,C.ink,600);text(665,40,'Игровое поле',13,second?C.muted:C.ink,600);text(810,40,'Моя галерея',13,second?C.ink:C.muted,600);text(955,40,'Журнал',13,C.muted);text(1070,40,'Памятка',13,C.muted);circle(1359,34,17,C.blue);text(1359,39,'А',13,C.white,700,undefined,'middle');text(1230,39,'Артём',13,C.ink,600);
 text(25,100,'РАУНД 4  /  ОБЫЧНАЯ ИГРА',10,'#B9C7B9',600);title(24,129,sub,24,C.paper);
 pill(568,91,112,'●  Ваш ход',C.gold,C.ink);text(707,110,'24',25,C.paper,600);text(746,109,'монеты',11,'#C9D2C4');text(831,110,'12',25,C.paper,600);text(867,109,'влияние',11,'#C9D2C4');ticket(968,88,C.blue,2);ticket(1009,88,C.pink,1);ticket(1050,88,C.cream,1);text(1148,108,'02:48',22,C.paper,600);text(1260,107,'Ход Артёма',12,'#C9D2C4');
}
function track(x,y,w,count=12,current=5){
 const gap=w/count;
 for(let i=0;i<count;i++){circle(x+gap*i+gap/2,y,9,i===current?C.dark:C.paper,i===current?C.paper:C.line,1);text(x+gap*i+gap/2,y+3,i+1,8,i===current?C.paper:C.muted,600,'Arial','middle')}
}
function room(x,y,w,h,num,name,action,color,occupants,showGallerist=true){
 rect(x,y,w,h,'#B0B4A1',2,'#E6E4D1',1);rect(x+5,y+5,w-10,h-10,'url(#stone)',1,color,2);
 rect(x+8,y+8,w-16,54,'#F0ECDD',1);text(x+14,y+27,'0'+num,11,color,700);title(x+43,y+29,name,18);text(x+15,y+49,action,10,C.muted);
 add(`<svg x="${x+9}" y="${y+67}" width="${w-18}" height="${h-75}" viewBox="0 0 230 147">
 <path d="M8 40L114 7L225 40L196 135L29 135Z" fill="#DEDCCB" stroke="#9B9F8F"/>
 <path d="M12 45L114 14L216 44L190 128H35Z" fill="url(#tiles)"/>
 <path d="M30 86L68 49L156 49L194 86L160 125H65Z" fill="#D3D1BF" stroke="#B0B2A2"/>
 <path d="M14 45L114 13L114 0L14 31Z" fill="#F6F2E6" stroke="#B9BAA9"/>
 <path d="M114 0L218 31L218 45L114 13Z" fill="#C7CABB" stroke="#A7AA99"/>
 <path d="M14 31L14 84L26 94L26 43Z" fill="#D6D7C7" stroke="#A7AA99"/>
 <path d="M218 31L218 84L205 94L205 43Z" fill="#F5F0DE" stroke="#B9BAA9"/>
 <path d="M54 56L85 47L85 89L54 99Z" fill="#F5F0DE" stroke="#B9BAA9"/>
 <path d="M54 99L61 103L92 93L85 89Z" fill="#9EA391" opacity=".7"/>
 <path d="M146 47L177 56L177 99L146 89Z" fill="#F5F0DE" stroke="#B9BAA9"/>
 <path d="M146 89L140 94L171 104L177 99Z" fill="#9EA391" opacity=".7"/>
 <path d="M33 110L76 135M154 135L199 110" stroke="#ABAFA0" stroke-width="3"/>
 <path d="M92 110L114 101L136 110L114 119Z" fill="#B7BDA9" stroke="#939D8E"/>
 </svg>`);
 if(showGallerist){circle(x+w/2,y+h-47,22,'#F9F5E9','#545B50',2);circle(x+w/2,y+h-47,18,'#C8CBBA','#FFF9E9');pawn(x+w/2,y+h-60,color,1.04)}people(x+36,y+h-29,occupants,.6);rect(x+6,y+6,w-12,h-12,'url(#paper)',1);
}
function garden(x,y,r=15){circle(x+3,y+4,r+1,'#525D45');circle(x,y,r,'#7F8E63');for(let i=0;i<9;i++){let t=i*2.4;circle(x+Math.cos(t)*r*.6,y+Math.sin(t)*r*.6,3+i%3,['#9B9E72','#6E835C','#ADB18A'][i%3])}}
function footer(){text(24,1003,'КОНЦЕПТ 03  /  демонстрационные данные',10,'#A8BCAC');text(1416,1003,'Иллюстрации и символы созданы заново',10,'#A8BCAC',400,undefined,'end')}
function start(height=1024,width=1440){a=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Галерист — настольная концепция</title><defs>
 <pattern id="felt" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0L6 6M-3 3L3 9M3 -3L9 3" stroke="#A1B3A0" stroke-width=".5" opacity=".11"/></pattern>
 <pattern id="paper" width="51" height="43" patternUnits="userSpaceOnUse"><path d="M0 4L22 7L34 3M7 24L18 21M33 35L48 39" stroke="#806F48" stroke-width=".5" opacity=".08"/><circle cx="30" cy="17" r="1" fill="#97856C" opacity=".08"/></pattern>
 <pattern id="oak" width="80" height="20" patternUnits="userSpaceOnUse"><rect width="80" height="20" fill="#DDD0AB"/><path d="M0 3Q30 7 80 2M0 10Q40 15 80 9M0 18Q30 13 80 17" fill="none" stroke="#B5A175" stroke-width=".6" opacity=".5"/></pattern>
 <pattern id="stone" width="28" height="18" patternUnits="userSpaceOnUse"><rect width="28" height="18" fill="#B2B8AA"/><path d="M0 0H28V18H0ZM0 9H28M14 0V9M6 9V18" fill="none" stroke="#C3C7BA" stroke-width=".7"/></pattern>
 <pattern id="tiles" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="#E1E0D0"/><path d="M0 0L24 16M-12 0L12 16M12 0L36 16M24 0L0 16M12 0L-12 16M36 0L12 16" stroke="#C5C9B6" stroke-width=".8"/></pattern>
 <pattern id="parquet" width="36" height="28" patternUnits="userSpaceOnUse"><rect width="36" height="28" fill="#CBB77A"/><path d="M0 0L18 14L36 0M0 7L18 21L36 7M0 14L18 28L36 14M0 21L18 35L36 21" fill="none" stroke="#EEE3B8" stroke-width="1" opacity=".6"/></pattern></defs>`]}
function end(file){add('</svg>');fs.writeFileSync(path.join(out,file),a.join('\n'));}

module.exports={C,add,rect,text,title,line,circle,pawn,meeple,people,coin,button,pill,ticket,art,artcard,header,track,room,garden,footer,start,end};
if(require.main===module){
start();header('Искусство начинается с вашего хода');
// One connected game board, with cards, museum rooms and public state.
rect(27,157,1038,632,'#193B39',5);rect(24,150,1038,632,'#D5DBC7',5,'#E8E1CB',3);rect(32,158,1022,616,'#8CA89C',2);rect(32,158,1022,616,'url(#stone)',2);
text(50,183,'ХУДОЖНИКИ И ПРОИЗВЕДЕНИЯ',10,C.paper,700);pill(222,168,62,'Все  →','#C4D0B8');
['Тихая геометрия','Красная линия','Золотое сечение','Отражения'].forEach((s,i)=>{
 let yy=200+i*132;artcard(48,yy,100,118,s,i);rect(160,yy+3,111,115,i%2?'#C0D7DF':'#E1BCC2',4,'#F5EDDC',2);rect(164,yy+7,103,20,i%2?'#447D93':'#A65362',3);text(171,yy+21,['Эмма Валь','Лев Орлов','Нина Берг','Марк Ли'][i],10,C.paper,600);text(171,yy+43,'ИЗВЕСТНОСТЬ',8,C.ink,600);track(166,yy+62,99,5,i+1);text(171,yy+94,'Стоимость',9,C.ink);text(247,yy+96,[8,11,14,17][i],14,C.ink,700,undefined,'end');
});
// Museum plan on the sage board.
rect(290,170,554,584,'#8E9C80',2,'#D2D9BC');rect(291,171,552,582,'url(#paper)',2);
add('<path d="M567 180C600 278 530 351 567 461S603 659 567 747M297 461C383 429 462 491 567 461S742 428 838 461" fill="none" stroke="#D4D6BE" stroke-width="33"/><path d="M567 180C600 278 530 351 567 461S603 659 567 747M297 461C383 429 462 491 567 461S742 428 838 461" fill="none" stroke="#A3AB99" stroke-width="24"/><path d="M567 180C600 278 530 351 567 461S603 659 567 747" fill="none" stroke="#E1E2CA" stroke-width="1"/>');
[[327,432],[394,487],[726,434],[800,489],[569,202],[565,709]].forEach(([x,y])=>garden(x,y,12));
room(306,188,248,222,1,'Художники','Открыть художника · Купить работу',C.blue,[C.paper,C.pink]);
room(580,188,248,222,2,'Медиацентр','Реклама · Найм помощников',C.orange,[C.gold]);
room(306,509,248,222,3,'Отдел продаж','Получить заказ · Продать работу',C.pink,[C.paper]);
room(580,509,248,222,4,'Междунар. рынок','Репутация · Сделать ставку',C.gold,[C.orange,C.blue]);
add('<ellipse cx="567" cy="461" rx="104" ry="53" fill="#AEB599" stroke="#EEEAD7" stroke-width="4"/><ellipse cx="567" cy="461" rx="91" ry="41" fill="url(#stone)" stroke="#777E6F"/><ellipse cx="567" cy="461" rx="80" ry="32" fill="#B5BEA1" stroke="#DBDEC6"/>');
text(567,445,'ПЛОЩАДЬ',10,C.dark,700,undefined,'middle');people(527,471,[C.paper,C.orange,C.pink,C.paper],.65);text(567,495,'Посетители',9,C.dark,400,undefined,'middle');
// A narrow printed public track.
rect(860,171,176,583,'#E3E2CD',4,'#C8CCAF');text(875,196,'МЕЖДУНАР. РЫНОК',9,C.dark,700);
for(let i=0;i<3;i++){text(901+i*48,224,i+1,12,C.dark,700,undefined,'middle');for(let j=0;j<6;j++){rect(880+i*48,238+j*58,42,50,j%2?'#D0D6BC':'#F1EDDB',3,'#AFBAA0');text(901+i*48,255+j*58,['+1','◇','+2','★','+3','★'][j],10,C.dark,600,undefined,'middle');if((i+j)%3===0)pawn(901+i*48,271+j*58,[C.pink,C.blue,C.orange][i],.5)}}
text(876,620,'АУКЦИОН',9,C.dark,700);coin(891,651,6);coin(940,651,9);coin(989,651,12);text(876,699,'Билеты в кассе',9,C.muted);ticket(880,713,C.blue,8);ticket(927,713,C.pink,6);ticket(974,713,C.orange,5);
for(let i=0;i<39;i++){let xx=44+i*25.6;rect(xx,760,24,15,i%5===0?'#C8899C':'#EBE7D7',1,'#A5AF9D',.5);text(xx+12,771,i,7,C.ink,500,undefined,'middle')}circle(248,758,5,C.blue);circle(454,758,5,C.pink);circle(608,758,5,C.gold);
// Turn panel: clear action sequence and occupancy choice.
rect(1082,150,334,632,C.cream,8);text(1106,181,'ВАШ ХОД',10,C.dark,700);title(1106,216,'Куда отправимся?',25);text(1106,241,'Выберите локацию на поле.',13,C.muted);
line(1106,260,1392,260);circle(1122,290,15,C.blue);text(1122,295,1,12,C.white,700,undefined,'middle');text(1149,287,'Перемещение',14,C.ink,700);text(1149,307,'Сообщество художников',11,C.muted);
rect(1106,328,286,149,'#E3E6D5',5);text(1122,353,'ДЕЙСТВИЕ ЛОКАЦИИ',9,C.dark,700);button(1122,369,254,'Купить работу',true);button(1122,420,254,'Открыть художника');
text(1106,509,'Оставить помощника',13,C.ink,600);text(1106,529,'в предыдущей локации',11,C.muted);pill(1306,498,86,'●  Да',C.dark,C.paper);
line(1106,548,1392,548);text(1106,575,'Личный черновик',13,C.dark,700);text(1106,597,'Другие увидят подтверждённый ход.',11,C.muted);button(1106,618,286,'Подтвердить ход',true);button(1106,669,286,'Сбросить выбор');text(1106,751,'История хода  ↗',11,C.muted);
// Personal player board: museum walls, office and tickets.
rect(24,802,1392,172,C.cream,3,'#D0CEB6');rect(240,815,600,145,'url(#parquet)',2);rect(24,802,9,172,C.blue,1);text(50,829,'МОЯ ГАЛЕРЕЯ',10,C.blue,700);title(50,860,'Артём',24);text(50,885,'2 работы · 3 посетителя',11,C.muted);people(60,929,[C.orange,C.paper,C.pink],.65);
for(let i=0;i<4;i++){const xx=248+i*146;add(`<path d="M${xx+6} 927V827L${xx+129} 839V939Z" fill="#F3EDDC" stroke="#B7B5A2"/><path d="M${xx+129} 839L${xx+136} 834V934L${xx+129} 939Z" fill="#B7B5A2"/>`);if(i<2){art(xx+18,844,99,64,i);text(xx+15,935,['Тихая геометрия','Красная линия'][i],10,C.ink)}else{rect(xx+35,854,62,42,'none',1,'#C8C8B7');text(xx+67,936,'Свободная стена',9,C.muted,400,undefined,'middle')}}
line(857,822,857,953);text(879,839,'ОФИС',10,C.dark,700);people(892,878,[C.blue,C.blue],.7);circle(953,881,12,'none',C.line);circle(984,881,12,'none',C.line);text(879,929,'Помощники  2 / 4',11,C.muted);
line(1026,822,1026,953);text(1048,839,'БИЛЕТЫ',10,C.dark,700);ticket(1048,859,C.blue,2);ticket(1090,859,C.pink,1);ticket(1132,859,C.orange,1);button(1200,850,192,'Планшет и цели');text(1200,922,'Галерея · Офис · Репутация',10,C.muted);footer();end('01-game-table-v2.svg');

start();header('Международный рынок',true);
rect(24,150,886,632,'#A0B6AA',3,'#E8E1CB',3);rect(28,154,878,624,'url(#stone)',1);text(48,180,'ПУБЛИЧНАЯ КОЛЛЕКЦИЯ',10,C.dark,700);text(884,180,'Три работы на аукционе',11,C.dark,400,undefined,'end');
// Three easels. Distinct paper cards and original artwork.
const works=['Тихая геометрия','Золотое сечение','Отражения'];
for(let i=0;i<3;i++){
 const xx=54+i*280;
 add(`<path d="M${xx+44} 481L${xx+96} 228H${xx+136}L${xx+190} 481M${xx+112} 233V489" fill="none" stroke="#B7925E" stroke-width="11" stroke-linecap="round"/>`);
 artcard(xx+19,210,208,241,works[i],i===1?2:i===2?3:0);rect(xx+7,447,232,13,'#C9A46C',3);text(xx+20,506,['Эмма Валь','Нина Берг','Марк Ли'][i],16,C.dark,700);text(xx+20,527,['Живопись','Скульптура','Фотография'][i],11,C.dark);
 rect(xx+10,551,232,97,'#5D7063',4);rect(xx+8,548,232,97,i%2?'#DBB5BE':'#BCD1D7',4,'#ECE8DC',2);rect(xx+12,552,224,24,i%2?'#A35869':'#477D8E',2);text(xx+23,569,'ИЗВЕСТНОСТЬ',9,C.paper,700);track(xx+16,592,218,8,3+i);text(xx+23,628,'Минимальная ставка',10,C.ink);coin(xx+213,621,[6,9,12][i]);
 button(xx+8,669,232,i===1?'Выбрано · 9 монет':'Выбрать работу',i===1);
}
text(48,755,'Посетители в вестибюле открывают доступ к колонкам рынка.',11,C.dark);people(800,744,[C.paper,C.orange,C.pink],.65);
// Gallery board: strong architectural wall motif from refs, newly composed.
rect(930,150,486,632,C.cream,8);rect(930,150,486,8,C.blue,3);text(954,184,'ЛИЧНЫЙ ПЛАНШЕТ',10,C.blue,700);title(954,218,'Галерея Артёма',28);text(954,245,'Коллекция, посетители и помощники',12,C.muted);
rect(950,269,446,264,'url(#parquet)',2,'#CFC6AC');
for(let i=0;i<4;i++){
 const xx=965+(i%2)*212, yy=283+Math.floor(i/2)*119;
 add(`<path d="M${xx} ${yy+96}V${yy}L${xx+190} ${yy+9}V${yy+105}Z" fill="#F5EFDE" stroke="#BDBDAA" stroke-width="1.5"/><path d="M${xx+190} ${yy+9}L${xx+198} ${yy+3}V${yy+99}L${xx+190} ${yy+105}Z" fill="#ADB09E"/><path d="M${xx+2} ${yy+2}L${xx+189} ${yy+11}" stroke="#FFFBEF" stroke-width="3"/>`);
 if(i<2){art(xx+29,yy+12,138,70,i);text(xx+98,yy+98,['Тихая геометрия','Красная линия'][i],9,C.muted,400,undefined,'middle')}
 else {rect(xx+68,yy+22,60,45,'none',1,'#D0C8B1');text(xx+98,yy+90,'Свободная стена',9,'#9C9A86',400,undefined,'middle')}
}
rect(950,549,214,111,'#E2E6D4',4);text(966,572,'ОФИС',10,C.dark,700);people(983,608,[C.blue,C.blue],.7);circle(1045,610,13,'none',C.line);circle(1080,610,13,'none',C.line);text(966,644,'2 помощника из 4',10,C.muted);
rect(1180,549,216,111,'#E2E6D4',4);text(1196,572,'ВЕСТИБЮЛЬ',10,C.dark,700);people(1211,608,[C.paper,C.orange,C.pink],.7);text(1196,644,'3 посетителя',10,C.muted);
text(954,692,'ВЛИЯНИЕ',10,C.dark,700);track(950,717,446,16,11);text(954,752,'Касса',10,C.muted);ticket(1007,734,C.blue,2);ticket(1052,734,C.pink,1);ticket(1097,734,C.orange,1);text(1389,752,'24 монеты',14,C.dark,700,undefined,'end');
// Explicit selected auction action; no invented resolution.
rect(24,802,1392,172,C.cream,8);text(48,831,'ЧЕРНОВИК ХОДА  /  МЕЖДУНАРОДНЫЙ РЫНОК',10,C.dark,700);title(48,866,'Ставка на «Золотое сечение»',26);text(48,895,'Выберите сумму. Результат появится после подтверждения хода.',12,C.muted);
rect(48,915,368,36,'#E4E6D5',4);text(64,938,'Баланс 24     −     Ставка 9     =     Остаток 15',12,C.dark,600);
text(525,846,'ВАША СТАВКА',10,C.muted,700);button(525,862,44,'−');rect(577,862,94,42,C.paper,4,C.line);text(624,890,'9',24,C.ink,600,undefined,'middle');button(679,862,44,'+');text(525,937,'Минимум для этой колонки: 9 монет',11,C.muted);
button(848,850,240,'Подтвердить ставку',true);button(1104,850,288,'Вернуться к полю');text(848,929,'Личный черновик · другие игроки пока не видят выбор',11,C.muted);footer();end('02-market-gallery-v2.svg');

const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Галерист — два концепта</title><style>body{margin:0;background:#102e27;color:#f4eedf;font:15px system-ui}header{padding:26px 4vw;position:sticky;top:0;background:#102e27ed;z-index:1;display:flex;gap:28px;align-items:center}h1{font-size:20px;margin:0}a{color:#e6cb8f}main{padding:0 4vw 45px}section{margin:15px 0 45px}h2{font-size:16px;font-weight:500}img{width:100%;box-shadow:0 14px 50px #0005;border-radius:8px}p{color:#b8c9bc;max-width:950px;line-height:1.6}</style><header><h1>Галерист / Настольная концепция</h1><a href="#table">01 · Игровой стол</a><a href="#market">02 · Рынок и галерея</a></header><main><p>Два ранних визуальных экрана по фотографиям настольной игры. Сохранены пространственная структура, мольберты, треки и цветные фишки; иллюстрации созданы заново. Данные демонстрационные. SVG-файлы можно перетащить в Figma для импорта векторных слоёв.</p><section id="table"><h2>01 · Игровой стол · ваш ход</h2><img src="01-game-table.svg" alt="Общий вид игрового стола"></section><section id="market"><h2>02 · Рынок и личная галерея</h2><img src="02-market-gallery.svg" alt="Международный рынок и личная галерея"></section></main></html>`;
fs.writeFileSync(path.join(out,'index.html'),html.replaceAll('01-game-table.svg','01-game-table-v2.svg').replaceAll('02-market-gallery.svg','02-market-gallery-v2.svg').replace('Два ранних визуальных экрана','Версия 2: архитектурные залы, дорожки, деревянные фишки, шкалы и паркет. Два ранних визуальных экрана'));
console.log('Created 01-game-table.svg, 02-market-gallery.svg, index.html');
}
