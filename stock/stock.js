(function(){
  var st=document.getElementById('status'),box=document.getElementById('list');
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
  function yen(n){return '¥'+String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',')}
  function fail(msg){st.textContent=msg;box.textContent=''}
  fetch('/stock/api').then(function(r){
    return r.json().then(function(j){if(!r.ok||j.error)throw new Error(j.error||r.status);return j})}).then(function(d){
    var t=new Date(d.fetchedAt),age=(Date.now()-t.getTime())/3600000;
    var hhmm=t.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    if(age>3){st.textContent='最終確認：'+hhmm+'（3時間以上前のデータです。更新が止まっている可能性があります）'}
    else{st.textContent='最終確認：'+hhmm+'（楽天市場）'}
    box.textContent='';
    d.products.forEach(function(p){
      var s=el('section','stk');
      s.appendChild(el('h2',null,p.name));
      s.appendChild(el('span','cat',p.cat+'・定価 '+yen(p.msrp)+'（税込）'));
      if(!p.stock.length){s.appendChild(el('p','none','現在、定価の在庫はありません'))}
      else{
        s.appendChild(el('p','ok','定価以下の在庫あり'));
        var ul=el('ul');
        p.stock.forEach(function(h){
          var li=el('li'),a=el('a');
          a.href=h.url;a.rel='sponsored noopener';a.setAttribute('data-aff','RAKUTEN_STOCK_CHECKER');
          a.appendChild(el('span','nm',h.name));
          a.appendChild(el('span','pr',yen(h.price)+'（税込・送料'+h.postage+'）'));
          a.appendChild(el('span','sub',h.shop+'（楽天市場）'+(h.reserve?'・予約':'')));
          li.appendChild(a);ul.appendChild(li)});
        s.appendChild(ul)}
      box.appendChild(s)});
  }).catch(function(){fail('在庫データを読み込めませんでした。時間をおいて開き直してください。（在庫がないという意味ではありません）')});
})();
