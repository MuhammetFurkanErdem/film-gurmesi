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
                                @${user.username || 'kullanici'} <br> 
                                <small>${user.name}</small>
                            </div>
                            <a href="profil.html"><i class="fas fa-user"></i> Profilim</a>
                            <a href="arkadaslar.html"><i class="fas fa-users"></i> Arkadaşlarım</a> <a href="#" onclick="cikisYap()"><i class="fas fa-sign-out-alt"></i> Çıkış Yap</a>
                        </div>
                    </div>`;
            }
            
            // --- ANA SAYFADAYSA ÖNERİLERİ GETİR ---
            if (document.getElementById("resultsContainer")) {
                onerileriGetir();
            }

            // --- PROFIL SAYFASINDAYSA LİSTEYİ VE FEED'İ GETİR ---
            if (typeof listeyiGetir === "function" && document.getElementById("watchlistContainer")) {
                listeyiGetir();
                if(document.getElementById("friendFeedContainer")) {
                    feedGetir();
                }
            }
        } else {
            if(loginBtn) loginBtn.style.display = "inline-block";
            if(userProfile) userProfile.style.display = "none";
            
            // KULLANICI YOKSA DA POPÜLERLERİ GETİR (Ana Sayfa)
            if (document.getElementById("resultsContainer")) {
                onerileriGetir();
            }
        }
    } catch (error) { console.error("Kullanıcı kontrolü hatası:", error); }
}

async function cikisYap() {
    await fetch(`${API_URL}/auth/logout`);
    window.location.reload();
}

// --- ARKADAŞLIK SİSTEMİ FONKSİYONLARI ---

async function arkadasEkle() {
    const email = document.getElementById("friendEmail").value;
    if(!email) return bildirimGoster("Lütfen bir e-posta adresi girin.", "hata");

    try {
        const res = await fetch(`${API_URL}/arkadas/ekle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ arkadas_email: email })
        });
        const data = await res.json();

        if (data.durum === "basarili") {
            bildirimGoster(data.mesaj);
            document.getElementById("friendEmail").value = ""; // Kutuyu temizle
            feedGetir(); // Akışı yenile
        } else {
            bildirimGoster(data.mesaj, "hata");
        }
    } catch (error) { console.error(error); bildirimGoster("Bir hata oluştu.", "hata"); }
}

async function feedGetir() {
    const container = document.getElementById("friendFeedContainer");
    if(!container) return;

    try {
        const res = await fetch(`${API_URL}/arkadas/akis`);
        const data = await res.json();

        if(!data.aktiviteler || data.aktiviteler.length === 0) {
            container.innerHTML = "<p style='color:#aaa; text-align:center; padding:20px;'>Arkadaşların henüz bir şey izlemedi.</p>";
            return;
        }

        container.innerHTML = "";
        data.aktiviteler.forEach(act => {
            const html = `
                <div class="feed-item">
                    <img src="${act.arkadas_foto}" class="feed-avatar" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
                    <div class="feed-content">
                        <div class="feed-header">
                            <strong onclick="window.location.href='public_profile.html?u=${act.arkadas_username}'" style="cursor:pointer; text-decoration:underline;">
                            <strong>${act.arkadas_adi}
                            </strong> bir filmi izledi:
                        </div>
                        <div class="feed-movie-card">
                            <img src="${act.film_poster}" class="feed-poster">
                            <div>
                                <div style="font-weight:bold; color:#e94560; margin-bottom:3px;">${act.film_adi}</div>
                                <div style="font-size:0.9em; color:#ffd700;">⭐ ${act.puan}/10</div>
                                ${act.yorum ? `<div class="feed-comment">"${act.yorum}"</div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
            container.innerHTML += html;
        });
    } catch (error) { console.error("Feed hatası:", error); }
}

// --- ARAMA İŞLEMLERİ ---
async function filmAra() {
    const query = document.getElementById("searchInput").value;
    const sortType = document.getElementById("sortSelect").value;
    const type = document.getElementById("typeSelect").value;

    if (!query) return bildirimGoster("⚠️ Lütfen bir isim yazın!", "hata");

    const container = document.getElementById("resultsContainer");
    
    // Başlığı Sıfırla
    const baslikAlani = document.querySelector(".results-section h2");
    if(baslikAlani) baslikAlani.innerText = "🔍 Arama Sonuçları";

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

// --- KİŞİSEL KART AÇMA ---
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

// --- EKLEME (GÜNCELLENMİŞ: ZATEN EKLİ KONTROLÜ) ---
async function listeyeEkle(tmdb_id, tur, ad, puan, poster) {
    const res = await fetch(`${API_URL}/ekle`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id, tur, ad, puan, poster })
    });
    
    const data = await res.json();

    if (res.ok) {
        if (data.mesaj === "Zaten ekli") {
            bildirimGoster("⚠️ Bu içerik zaten listende var!", "hata");
        } else {
            bildirimGoster("✅ " + ad + " listene eklendi!");
            listeyiGetir();
        }
    } else if (res.status === 401) {
        bildirimGoster("⚠️ Önce giriş yapmalısın!", "hata");
    } else {
        bildirimGoster("Hata!", "hata");
    }
}

// --- YILDIZ PUANLAMA SİSTEMİ ---
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

// Fonksiyonu dışarı açıyoruz
window.yildizSec = yildizSec;

function izlemeDurumuKontrol(id, mevcutDurum) {
    if (mevcutDurum === "Hayır") ratingModalAc(id);
    else durumGuncelleAPI(id, "Hayır", 0, "");
}

function ratingModalAc(id) {
    document.getElementById("ratingFilmId").value = id;
    document.getElementById("ratingModal").style.display = "block";
    
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
        if(document.getElementById("friendFeedContainer")) feedGetir(); // Aktiviteyi de yenile
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

// --- RASTGELE FİLM ÖNERİSİ ---
function rastgeleOner() {
    const izlenmeyenler = tumFilmler.filter(f => f.izlendi !== "Evet");
    
    if (izlenmeyenler.length === 0) {
        return Swal.fire({
            title: 'Wow!',
            text: 'Listendeki her şeyi izlemişsin! Yeni filmler eklemelisin.',
            icon: 'success',
            background: '#16213e', color: '#fff', confirmButtonColor: '#e94560'
        });
    }

    const rastgeleIndex = Math.floor(Math.random() * izlenmeyenler.length);
    const film = izlenmeyenler[rastgeleIndex];

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
            detayAc(film.tmdb_id, film.tur);
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            rastgeleOner();
        }
    });
}

// --- ANA SAYFA ÖNERİLERİ (CACHE BUSTING ILE) ---
async function onerileriGetir() {
    const container = document.getElementById("resultsContainer");
    const baslikAlani = document.querySelector(".results-section h2");
    
    container.innerHTML = '<p style="color:#aaa; width:100%; text-align:center;">Sizin için seçiliyor...</p>';

    try {
        // Cache: no-store ile her seferinde taze veri al
        const res = await fetch(`${API_URL}/oneriler`, { cache: "no-store" });
        const data = await res.json();
        
        container.innerHTML = "";
        
        if(baslikAlani && data.baslik) {
            baslikAlani.innerText = "✨ " + data.baslik;
        }

        data.sonuc.forEach(item => {
            const posterUrl = item.poster ? item.poster : "https://via.placeholder.com/500x750?text=Resim+Yok";
            const safeAd = item.ad.replace(/'/g, "\\'"); 
            const rawType = item.tur === "Dizi" ? "tv" : "movie";

            const html = `
                <div class="card">
                    <div style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:3px 8px; border-radius:5px; font-size:0.8em; z-index:2;">${item.tur}</div>
                    <img src="${posterUrl}" alt="${item.ad}">
                    <h3>${item.ad}</h3>
                    <p>⭐ ${item.puan.toFixed(1)}</p>
                    <button class="detail-btn" onclick="detayAc(${item.tmdb_id}, '${rawType}')"><i class="fas fa-info-circle"></i> Detay</button>
                    <button class="add-btn" onclick="listeyeEkle(${item.tmdb_id}, '${rawType}', '${safeAd}', ${item.puan}, '${posterUrl}')"><i class="fas fa-plus"></i> Listeme Ekle</button>
                </div>`;
            container.innerHTML += html;
        });

    } catch (error) {
        console.error("Öneri hatası:", error);
        container.innerHTML = "<p style='text-align:center'>Şu an öneri sunulamıyor.</p>";
    }
}

/* --- ARKADAŞLIK SAYFASI FONKSİYONLARI --- */

async function kullaniciAra() {
    const query = document.getElementById("userSearchInput").value;
    if (!query) return;

    const container = document.getElementById("userSearchResults");
    container.innerHTML = "Aranıyor...";

    try {
        const res = await fetch(`${API_URL}/kullanici/ara/${query}`);
        const data = await res.json();
        container.innerHTML = "";

        if (data.sonuclar.length === 0) {
            container.innerHTML = "<p style='text-align:center; width:100%'>Kullanıcı bulunamadı.</p>";
            return;
        }

        data.sonuclar.forEach(user => {
            container.innerHTML += `
                <div class="friend-card">
                    <img src="${user.picture}" alt="${user.name}">
                    <div style="flex:1;">
                        <div style="font-weight:bold;">${user.name}</div>
                        <div style="font-size:0.9em; color:#aaa;">@${user.username}</div>
                    </div>
                    <button onclick="istekGonder('${user.username}')" class="add-friend-btn">
                        <i class="fas fa-user-plus"></i>
                    </button>
                </div>`;
        });
    } catch (e) { console.error(e); }
}

async function takipEt(username) {
    try {
        const res = await fetch(`${API_URL}/arkadas/ekle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username })
        });
        const data = await res.json();
        
        if (data.durum === "basarili") {
            bildirimGoster(data.mesaj);
            arkadaslariListele(); // Listeyi yenile
            document.getElementById("userSearchResults").innerHTML = ""; // Arama sonucunu temizle
            document.getElementById("userSearchInput").value = "";
        } else {
            bildirimGoster(data.mesaj, "hata");
        }
    } catch (e) { console.error(e); }
}

async function arkadaslariListele() {
    const container = document.getElementById("myFriendsList");
    if (!container) return;

    try {
        const res = await fetch(`${API_URL}/arkadaslarim`);
        const data = await res.json();
        
        if (data.arkadaslar.length === 0) {
            container.innerHTML = "<p style='text-align:center; width:100%'>Henüz kimseyi takip etmiyorsun.</p>";
            return;
        }

        container.innerHTML = "";
        data.arkadaslar.forEach(user => {
            container.innerHTML += `
                <div class="friend-card" onclick="window.location.href='public_profile.html?u=${user.username}'" style="cursor:pointer;">
                    <img src="${user.picture}" alt="${user.name}">
                    <div>
                        <div style="font-weight:bold;">${user.name}</div>
                        <div style="font-size:0.9em; color:#aaa;">@${user.username}</div>
                    </div>
                </div>`;
        });
    } catch (e) { console.error(e); }
}

/* --- YENİ ARKADAŞLIK FONKSİYONLARI --- */

// İstek Gönder (Eski takipEt yerine bunu kullanacağız)
async function istekGonder(username) {
    try {
        const res = await fetch(`${API_URL}/arkadas/istek-gonder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username })
        });
        const data = await res.json();
        
        if (data.durum === "basarili") {
            bildirimGoster(data.mesaj);
            document.getElementById("userSearchResults").innerHTML = ""; 
            document.getElementById("userSearchInput").value = "";
        } else {
            bildirimGoster(data.mesaj, "hata");
        }
    } catch (e) { console.error(e); }
}

// Gelen İstekleri Listele
async function istekleriListele() {
    const container = document.getElementById("incomingRequestsList");
    const section = document.getElementById("incomingRequestsSection");
    if (!container) return;

    try {
        const res = await fetch(`${API_URL}/arkadas/gelen-istekler`);
        const data = await res.json();

        if (data.istekler.length > 0) {
            section.style.display = "block"; // İstek varsa kutuyu göster
            container.innerHTML = "";
            data.istekler.forEach(req => {
                container.innerHTML += `
                    <div class="friend-card" style="border-color:#ffd700;">
                        <img src="${req.picture}" alt="${req.name}">
                        <div style="flex:1;">
                            <div style="font-weight:bold;">${req.name}</div>
                            <div style="font-size:0.9em; color:#aaa;">@${req.username}</div>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button onclick="istekYanitla(${req.id}, 'kabul')" class="add-friend-btn" style="background:#00b09b;"><i class="fas fa-check"></i></button>
                            <button onclick="istekYanitla(${req.id}, 'red')" class="add-friend-btn" style="background:#e94560;"><i class="fas fa-times"></i></button>
                        </div>
                    </div>`;
            });
        } else {
            section.style.display = "none";
        }
    } catch (e) { console.error(e); }
}

// İsteği Kabul/Red Et
async function istekYanitla(id, durum) {
    try {
        const res = await fetch(`${API_URL}/arkadas/yanitla`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ istek_id: id, durum: durum })
        });
        const data = await res.json();
        
        bildirimGoster(data.mesaj, durum === 'kabul' ? 'basarili' : 'hata');
        istekleriListele(); // Listeyi yenile
        arkadaslariListele(); // Arkadaş listesini de yenile (Kabul edildiyse)
    } catch (e) { console.error(e); }
}

/* --- ARKADAŞ PROFİLİ (PUBLIC PROFILE) --- */

async function loadPublicProfile(username) {
    try {
        const res = await fetch(`${API_URL}/kullanici-profil/${username}`);
        const data = await res.json();

        if (!data.user) {
            document.body.innerHTML = "<h2 style='color:white; text-align:center;'>Kullanıcı bulunamadı.</h2>";
            return;
        }

        // Başlık ve İstatistikler
        document.getElementById("friendNameHeader").innerHTML = `
            <img src="${data.user.picture}" style="width:50px; border-radius:50%; vertical-align:middle; margin-right:10px;">
            ${data.user.name}
        `;
        document.getElementById("friendWatched").innerText = data.stats.watched;
        document.getElementById("friendType").innerText = data.stats.type; // innerHTML yerine innerText kullandık, renkli span backend'den gelmiyorsa CSS ile halledilir.
        
        // Uyum Skoru Rengi
        const score = data.match.score;
        const scoreEl = document.getElementById("matchScore");
        scoreEl.innerText = `%${score}`;
        if(score > 70) scoreEl.style.color = "#00b09b"; // Yeşil
        else if(score > 40) scoreEl.style.color = "#ffd700"; // Sarı
        else scoreEl.style.color = "#e94560"; // Kırmızı

        // Listeyi Dök
        const container = document.getElementById("friendWatchlistContainer");
        container.innerHTML = "";
        
        if (data.list.length === 0) {
            container.innerHTML = "<p style='text-align:center; color:#aaa;'>Bu kullanıcının listesi boş.</p>";
            return;
        }

        // İzlenenleri öne al
        const sortedList = data.list.sort((a, b) => (a.izlendi === "Evet") - (b.izlendi === "Evet"));

        sortedList.forEach(film => {
            const izlendiClass = film.izlendi === "Evet" ? "izlendi-ok" : "";
            const puanHtml = film.kisisel_puan > 0 ? `<span style="color:#ffd700">(${film.kisisel_puan}/10)</span>` : "";
            
            // Tıklayınca Sadece Oku Modalı açılır
            const html = `
                <div class="list-item ${izlendiClass}" onclick="openReadOnly('${film.ad}', '${film.kisisel_puan}', '${film.kisisel_yorum || ''}')" style="cursor:pointer;">
                    <div style="flex:1;">
                        <strong>${film.ad}</strong> ${puanHtml} <br>
                        <small>⭐ ${film.puan.toFixed(1)} | ${film.tur === 'movie' ? 'Film' : 'Dizi'}</small>
                    </div>
                    ${film.izlendi === 'Evet' ? '<i class="fas fa-check" style="color:#00b09b;"></i>' : '<i class="fas fa-clock" style="color:#aaa;"></i>'}
                </div>`;
            container.innerHTML += html;
        });

    } catch (e) { console.error(e); }
}

function openReadOnly(ad, puan, yorum) {
    // Sadece izlenenlerin detayı görünsün
    if (puan == 0 && !yorum) return;

    document.getElementById("readOnlyModal").style.display = "block";
    document.getElementById("roTitle").innerText = ad;
    document.getElementById("roScore").innerText = puan > 0 ? puan : "-";
    document.getElementById("roReview").innerText = yorum || "Yorum yok.";
}