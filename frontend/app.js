const API_URL = "";

// Sayfa açılınca
window.onload = async function() {
    await kullaniciKontrol();
};

function bildirimGoster(mesaj, tip = "basarili") {
    const renk = tip === "basarili" ? "linear-gradient(to right, #00b09b, #96c93d)" : "linear-gradient(to right, #ff5f6d, #ffc371)";
    Toastify({
        text: mesaj, duration: 3000, gravity: "bottom", position: "right", 
        style: { background: renk, borderRadius: "10px", fontSize: "16px", zIndex: 9999 }
    }).showToast();
}

// --- KULLANICI KONTROLÜ ---
async function kullaniciKontrol() {
    try {
        const res = await fetch(`${API_URL}/user_info`);
        const user = await res.json();
        const loginBtn = document.getElementById("loginBtn");
        const userProfile = document.getElementById("userProfile");

        if (user) {
            if(loginBtn) loginBtn.style.display = "none";
            if(userProfile) {
                userProfile.style.display = "block";
                userProfile.innerHTML = `
                    <div class="user-menu-container" onclick="menuyuAcKapat()">
                        <img src="${user.picture}" class="user-avatar" alt="Profil">
                        <div id="myDropdown" class="dropdown-content">
                            <div style="padding: 10px; font-size: 0.8em; color: #aaa; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                ${user.name}
                            </div>
                            <a href="profil.html"><i class="fas fa-user"></i> Profilim</a>
                            <a href="#" onclick="cikisYap()"><i class="fas fa-sign-out-alt"></i> Çıkış Yap</a>
                        </div>
                    </div>`;
            }
            if (typeof listeyiGetir === "function" && document.getElementById("watchlistContainer")) {
                listeyiGetir();
            }
        } else {
            if(loginBtn) loginBtn.style.display = "inline-block";
            if(userProfile) userProfile.style.display = "none";
        }
    } catch (error) { console.error("Kullanıcı kontrolü hatası:", error); }
}

async function cikisYap() {
    await fetch(`${API_URL}/auth/logout`);
    window.location.reload();
}

// --- ARAMA İŞLEMLERİ ---
async function filmAra() {
    const query = document.getElementById("searchInput").value;
    const sortType = document.getElementById("sortSelect").value;
    const type = document.getElementById("typeSelect").value;

    if (!query) return bildirimGoster("⚠️ Lütfen bir isim yazın!", "hata");

    const container = document.getElementById("resultsContainer");
    container.innerHTML = '<p style="color:white; width:100%; text-align:center;">Aranıyor...</p>';

    try {
        const res = await fetch(`${API_URL}/search/${query}?tur=${type}&sirala=${sortType}`);
        const data = await res.json();
        container.innerHTML = "";

        if (!data.sonuc || data.sonuc.length === 0) {
            container.innerHTML = "<p>Sonuç bulunamadı.</p>"; return;
        }

        data.sonuc.forEach(item => {
            const posterUrl = item.poster ? item.poster : "https://via.placeholder.com/500x750?text=Resim+Yok";
            const safeAd = item.ad.replace(/'/g, "\\'"); 

            const html = `
                <div class="card">
                    <div style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:3px 8px; border-radius:5px; font-size:0.8em; z-index:2;">${item.tur}</div>
                    <img src="${posterUrl}" alt="${item.ad}">
                    <h3>${item.ad}</h3>
                    <p>⭐ ${item.puan.toFixed(1)}</p>
                    <button class="detail-btn" onclick="detayAc(${item.tmdb_id}, '${type}')"><i class="fas fa-info-circle"></i> Detay</button>
                    <button class="add-btn" onclick="listeyeEkle(${item.tmdb_id}, '${type}', '${safeAd}', ${item.puan}, '${posterUrl}')"><i class="fas fa-plus"></i> Listeme Ekle</button>
                </div>`;
            container.innerHTML += html;
        });
    } catch (error) { console.error(error); bildirimGoster("Bağlantı hatası!", "hata"); }
}

// --- LİSTE YÖNETİMİ ---
let tumFilmler = [];

async function listeyiGetir() {
    try {
        const res = await fetch(`${API_URL}/listem`);
        const data = await res.json();
        const container = document.getElementById("watchlistContainer");
        if(!container) return;

        if (!data.listem) { container.innerHTML = "<p style='text-align:center'>Listeniz boş.</p>"; return; }

        tumFilmler = data.listem;
        istatistikGuncelle();

        container.innerHTML = "";
        const siraliListe = tumFilmler.sort((a, b) => (a.izlendi === "Evet") - (b.izlendi === "Evet"));

        siraliListe.forEach(film => {
            const izlendiClass = film.izlendi === "Evet" ? "izlendi-ok" : "";
            const btnClass = film.izlendi === "Evet" ? "btn-active" : "";
            const kisiselPuanHtml = film.kisisel_puan > 0 ? `<span style="color:#ffd700; font-size:0.9em; margin-left:10px;">(Sen: ${film.kisisel_puan}/10)</span>` : "";

            const html = `
                <div class="list-item ${izlendiClass}">
                    <div style="flex:1; cursor: pointer;" onclick="listeElemaniTikla(${film.id})">
                        <strong>${film.ad}</strong> ${kisiselPuanHtml} <br>
                        <small>⭐ ${film.puan.toFixed(1)} | ${film.tur === 'movie' ? 'Film' : 'Dizi'}</small>
                    </div>
                    <div class="list-actions">
                        <button class="check-btn ${btnClass}" onclick="izlemeDurumuKontrol(${film.id}, '${film.izlendi}')"><i class="fas fa-check"></i></button>
                        <button class="delete-btn" onclick="listedenSil(${film.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            container.innerHTML += html;
        });
    } catch (error) { console.error("Liste hatası:", error); }
}

// --- YENİ TIKLAMA FONKSİYONU ---
function listeElemaniTikla(id) {
    const film = tumFilmler.find(f => f.id === id);
    if (!film) return;

    if (film.izlendi === "Evet") {
        document.getElementById("personalModal").style.display = "block";
        document.getElementById("pTitle").innerText = film.ad;
        document.getElementById("pScore").innerText = film.kisisel_puan || "-";
        
        const yorum = film.kisisel_yorum && film.kisisel_yorum.trim() !== "" 
            ? `"${film.kisisel_yorum}"` 
            : "Henüz bir not eklememişsin.";
        document.getElementById("pReview").innerText = yorum;
    } else {
        detayAc(film.tmdb_id, film.tur);
    }
}

function personalModalKapat() {
    document.getElementById("personalModal").style.display = "none";
}

// --- İSTATİSTİKLER ---
function istatistikGuncelle() {
    const izlenen = tumFilmler.filter(f => f.izlendi === "Evet").length;
    const bekleyen = tumFilmler.length - izlenen;
    const filmSayisi = tumFilmler.filter(f => f.izlendi === "Evet" && f.tur === 'movie').length;
    const diziSayisi = tumFilmler.filter(f => f.izlendi === "Evet" && f.tur === 'tv').length;
    
    let favoriFormat = "Henüz Yok";
    if (filmSayisi > diziSayisi) favoriFormat = "🎬 Filmci";
    else if (diziSayisi > filmSayisi) favoriFormat = "📺 Dizici";
    else if (izlenen > 0) favoriFormat = "⚖️ Dengeli";

    if(document.getElementById("statWatched")) {
        document.getElementById("statWatched").innerText = izlenen;
        document.getElementById("statPending").innerText = bekleyen;
        document.getElementById("statType").innerHTML = `<span style="color:#e94560">${favoriFormat}</span>`;
    }
}

// --- SİLME ---
async function listedenSil(id) {
    const sonuc = await Swal.fire({
        title: 'Emin misin?', text: "Bu filmi listenden silmek üzeresin!", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#e94560', cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sil gitsin!', cancelButtonText: 'Vazgeç', background: '#16213e', color: '#fff'
    });

    if (sonuc.isConfirmed) {
        const res = await fetch(`${API_URL}/sil/${id}`, { method: "DELETE" });
        if (res.ok) { bildirimGoster("🗑️ Silindi", "basarili"); listeyiGetir(); }
        else { bildirimGoster("Hata oluştu!", "hata"); }
    }
}

// --- EKLEME ---
async function listeyeEkle(tmdb_id, tur, ad, puan, poster) {
    const res = await fetch(`${API_URL}/ekle`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id, tur, ad, puan, poster })
    });
    if (res.ok) { bildirimGoster("✅ Eklendi!"); listeyiGetir(); }
    else if (res.status === 401) bildirimGoster("⚠️ Giriş yapmalısın!", "hata");
    else bildirimGoster("Hata!", "hata");
}

// --- YILDIZ PUANLAMA SİSTEMİ (EN ALTA ALDIM VE ÇAKIŞMAYI GİDERDİM) ---
const puanMetinleri = {
    1: "Çöp", 2: "Berbat", 3: "Çok Kötü", 4: "Kötü", 5: "İdare Eder",
    6: "Ortalama", 7: "Güzel", 8: "İyi", 9: "Çok İyi", 10: "Efsane"
};

function yildizSec(puan) {
    document.getElementById("userRating").value = puan;

    const metin = puanMetinleri[puan] || "";
    document.getElementById("ratingText").innerText = `${puan} - ${metin}`;
    
    const yildizlar = document.querySelectorAll('.s-item');
    yildizlar.forEach(yildiz => {
        const yildizDegeri = parseInt(yildiz.getAttribute('data-value'));
        
        if (yildizDegeri <= puan) {
            yildiz.classList.add('active'); 
        } else {
            yildiz.classList.remove('active'); 
        }
    });
}

// Fonksiyonu dışarı açıyoruz ki HTML'den çağrılabilsin
window.yildizSec = yildizSec;

function izlemeDurumuKontrol(id, mevcutDurum) {
    if (mevcutDurum === "Hayır") ratingModalAc(id);
    else durumGuncelleAPI(id, "Hayır", 0, "");
}

// TEK VE DOĞRU MODAL AÇMA FONKSİYONU
function ratingModalAc(id) {
    document.getElementById("ratingFilmId").value = id;
    document.getElementById("ratingModal").style.display = "block";
    
    // Varsayılan olarak 10 puan seçili gelsin ve yıldızları boyasın
    yildizSec(10); 
    document.getElementById("userReview").value = "";
}

function ratingModalKapat() { document.getElementById("ratingModal").style.display = "none"; }

async function incelemeyiKaydet() {
    const id = document.getElementById("ratingFilmId").value;
    const puan = document.getElementById("userRating").value;
    const yorum = document.getElementById("userReview").value;
    await durumGuncelleAPI(id, "Evet", parseInt(puan), yorum);
    ratingModalKapat();
}

async function durumGuncelleAPI(id, izlendi, puan, yorum) {
    const res = await fetch(`${API_URL}/guncelle/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ izlendi, kisisel_puan: puan, kisisel_yorum: yorum })
    });
    if (res.ok) { 
        if(izlendi==="Evet") bildirimGoster("🎉 Kaydedildi!", "basarili");
        else bildirimGoster("Geri alındı.");
        listeyiGetir(); 
    }
}

// --- NORMAL DETAY ---
async function detayAc(tmdb_id, tur = 'movie') {
    const modal = document.getElementById("movieModal");
    modal.style.display = "block"; 
    document.getElementById("modalVideo").innerHTML = "Yükleniyor...";
    const res = await fetch(`${API_URL}/detay/${tmdb_id}?tur=${tur}`);
    const data = await res.json();
    
    document.getElementById("modalTitle").innerText = data.baslik;
    document.getElementById("modalTagline").innerText = data.tagline || "";
    document.getElementById("modalRating").innerText = `IMDb : ${data.puan.toFixed(1)}`;
    document.getElementById("modalRuntime").innerText = `🕒 : ${data.sure} dk`;
    document.getElementById("modalOverview").innerText = data.ozet;
    document.getElementById("modalGenres").innerText = data.turler.join(", ");
    document.getElementById("modalDirector").innerText = data.yonetmen;
    document.getElementById("modalCast").innerText = data.oyuncular.join(", ");

    const platformDiv = document.getElementById("modalPlatforms");
    if (data.platformlar && data.platformlar.length > 0) {
        let html = '<span class="platform-title">📺 Şurada İzle :</span><div class="platform-container">';
        data.platformlar.forEach(p => html += `<img src="${p.logo}" title="${p.ad}" class="platform-logo">`);
        platformDiv.innerHTML = html + '</div>';
    } else platformDiv.innerHTML = '<p style="color:#aaa; font-size:0.9em;">😔 Dijital platformlarda yok.</p>';

    const videoDiv = document.getElementById("modalVideo");
    if (data.youtube_video) videoDiv.innerHTML = `<iframe src="${data.youtube_video}" allowfullscreen></iframe>`;
    else if (data.backdrop) videoDiv.innerHTML = `<img src="${data.backdrop}" style="width:100%; border-radius:10px;">`;
    else videoDiv.innerHTML = "<p style='color:white; text-align:center;'>Görsel yok.</p>";
    
    const imdbBtn = document.getElementById("modalImdb");
    if (data.imdb_id) { imdbBtn.style.display = "inline-block"; imdbBtn.href = `https://www.imdb.com/title/${data.imdb_id}`; }
    else imdbBtn.style.display = "none";
}

function modalKapat() {
    document.getElementById("movieModal").style.display = "none";
    document.getElementById("modalVideo").innerHTML = "";
}

// --- DİĞER OLAYLAR ---
function menuyuAcKapat() { document.getElementById("myDropdown").classList.toggle("show-menu"); }

window.onclick = function(event) {
    if (!event.target.matches('.user-avatar')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show-menu')) dropdowns[i].classList.remove('show-menu');
        }
    }
    if (event.target == document.getElementById("movieModal")) modalKapat();
    if (event.target == document.getElementById("personalModal")) personalModalKapat();
    if (event.target == document.getElementById("ratingModal")) ratingModalKapat();
}

document.getElementById("searchInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") filmAra();
});

/* --- RASTGELE FİLM ÖNERİSİ --- */
function rastgeleOner() {
    // 1. Sadece İZLENMEMİŞ (Hayır) olanları filtrele
    const izlenmeyenler = tumFilmler.filter(f => f.izlendi !== "Evet");
    
    // 2. Eğer izlenecek film kalmadıysa uyarı ver
    if (izlenmeyenler.length === 0) {
        return Swal.fire({
            title: 'Wow!',
            text: 'Listendeki her şeyi izlemişsin! Yeni filmler eklemelisin.',
            icon: 'success',
            background: '#16213e', color: '#fff', confirmButtonColor: '#e94560'
        });
    }

    // 3. Rastgele bir sayı seç
    const rastgeleIndex = Math.floor(Math.random() * izlenmeyenler.length);
    const film = izlenmeyenler[rastgeleIndex];

    // 4. Büyüleyici bir pencerede göster
    Swal.fire({
        title: '🎲 Günün Önerisi',
        html: `
            <div style="text-align:center;">
                <img src="${film.poster}" style="width:150px; border-radius:10px; box-shadow:0 0 20px rgba(255,255,255,0.2); margin-bottom:15px;">
                <h3 style="color:#e94560; margin-bottom:5px;">${film.ad}</h3>
                <p style="color:#aaa; font-size:0.9em;">${film.tur === 'movie' ? 'Film' : 'Dizi'} • ⭐ ${film.puan.toFixed(1)}</p>
                <p style="color:#fff; margin-top:10px;">Bunu izlemeye ne dersin?</p>
            </div>
        `,
        background: '#16213e',
        color: '#fff',
        showCancelButton: true,
        confirmButtonText: '🎬 Detaylara Git',
        cancelButtonText: 'Tekrar Dene',
        confirmButtonColor: '#e94560',
        cancelButtonColor: '#3085d6',
        reverseButtons: true
    }).then((result) => {
        if (result.isConfirmed) {
            // Detay butonuna basarsa filmin detayını aç
            detayAc(film.tmdb_id, film.tur);
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            // "Tekrar Dene" derse fonksiyonu yeniden çalıştır
            rastgeleOner();
        }
    });
}