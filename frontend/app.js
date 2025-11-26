const API_URL = "";

// Sayfa açılınca hem listeyi hem kullanıcıyı kontrol et
window.onload = async function() {
    await kullaniciKontrol();
};

function bildirimGoster(mesaj, tip = "basarili") {
    const renk = tip === "basarili" ? "linear-gradient(to right, #00b09b, #96c93d)" : "linear-gradient(to right, #ff5f6d, #ffc371)";

    Toastify({
        text: mesaj,
        duration: 3000,
        gravity: "bottom",
        position: "right", 
        style: {
            background: renk,
            borderRadius: "10px",
            fontSize: "16px"
        }
    }).showToast();
}

// --- KULLANICI KONTROLÜ (GÜNCELLENMİŞ) ---
async function kullaniciKontrol() {
    try {
        const res = await fetch(`${API_URL}/user_info`);
        const user = await res.json();

        const loginBtn = document.getElementById("loginBtn");
        const userProfile = document.getElementById("userProfile");

        if (user) {
            // Kullanıcı VAR: Giriş butonunu gizle, Profili göster
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
                    </div>
                `;
            }
            // Ana sayfadaysa listeyi getirmeye gerek yok (Profil sayfasında çalışır)
            if (typeof listeyiGetir === "function" && document.getElementById("watchlistContainer")) {
                listeyiGetir();
            }
        } else {
            // Kullanıcı YOK: Giriş butonunu göster, Profili gizle
            if(loginBtn) loginBtn.style.display = "inline-block";
            if(userProfile) userProfile.style.display = "none";
        }
    } catch (error) {
        console.error("Kullanıcı kontrolü hatası:", error);
    }
}

// --- ÇIKIŞ YAPMA ---
async function cikisYap() {
    await fetch(`${API_URL}/auth/logout`);
    window.location.reload();
}


async function filmAra() {
    const query = document.getElementById("searchInput").value;
    const sortType = document.getElementById("sortSelect").value;
    const type = document.getElementById("typeSelect").value; // movie veya tv

    if (!query) return bildirimGoster("⚠️ Lütfen bir isim yazın!", "hata");

    const container = document.getElementById("resultsContainer");
    container.innerHTML = '<p style="color:white; width:100%; text-align:center;">Aranıyor...</p>';

    try {
        // URL oluştur
        const res = await fetch(`${API_URL}/search/${query}?tur=${type}&sirala=${sortType}`);
        const data = await res.json();
        container.innerHTML = "";

        if (!data.sonuc || data.sonuc.length === 0) {
            container.innerHTML = "<p>Sonuç bulunamadı.</p>";
            return;
        }

        data.sonuc.forEach(item => {
            // Poster Kontrolü
            const posterUrl = item.poster ? item.poster : "https://via.placeholder.com/500x750?text=Resim+Yok";
            const safeAd = item.ad.replace(/'/g, "\\'"); 

            const html = `
                <div class="card">
                    <div style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:3px 8px; border-radius:5px; font-size:0.8em; z-index:2;">
                        ${item.tur}
                    </div>
                    
                    <img src="${posterUrl}" alt="${item.ad}" style="width:100%; border-radius:10px; margin-bottom:10px;">
                    
                    <h3>${item.ad}</h3>
                    <p>⭐ ${item.puan.toFixed(1)}</p>
                    
                    <button class="detail-btn" onclick="detayAc(${item.tmdb_id}, '${type}')">
                        <i class="fas fa-info-circle"></i> Detay
                    </button>
                    
                    <button class="add-btn" onclick="listeyeEkle(${item.tmdb_id}, '${type}', '${safeAd}', ${item.puan}, '${posterUrl}')">
                        <i class="fas fa-plus"></i> Listeme Ekle
                    </button>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (error) {
        console.error(error);
        bildirimGoster("Bağlantı hatası oluştu!", "hata");
    }
}

// --- LİSTEYİ GETİR (GÜNCELLENDİ: Akıllı Sıralama) ---
// --- LİSTEYİ GETİR (FİNAL VERSİYON) ---
async function listeyiGetir() {
    try {
        const res = await fetch(`${API_URL}/listem`);
        const data = await res.json();
        const container = document.getElementById("watchlistContainer");
        if(!container) return;
        container.innerHTML = "";

        if (!data.listem) return;

        // --- SIRALAMA MANTIĞI ---
        // İzlenmeyenleri (Evet olmayanları) öne, izlenenleri arkaya alıyoruz
        const izlenmeyenler = data.listem.filter(film => film.izlendi !== "Evet");
        const izlenenler = data.listem.filter(film => film.izlendi === "Evet");
        const siraliListe = [...izlenmeyenler, ...izlenenler];

        siraliListe.forEach(film => {
            // Görsel Ayarlar
            const izlendiClass = film.izlendi === "Evet" ? "izlendi-ok" : "";
            const btnClass = film.izlendi === "Evet" ? "btn-active" : "";
            
            // Not: detayAc fonksiyonuna 'tmdb_id' gönderiyoruz (Detayları çekmek için)
            // Diğer butonlara ise 'id' gönderiyoruz (Veritabanından silmek/güncellemek için)

            const html = `
                <div class="list-item ${izlendiClass}">
                    
                    <div style="flex:1; cursor: pointer;" onclick="detayAc(${film.tmdb_id}, '${film.tur}')" title="Detaylar için tıkla">
                        <strong>${film.ad}</strong> <br>
                        <small>⭐ ${film.puan.toFixed(1)}</small>
                    </div>
                    
                    <div class="list-actions">
                        <button class="check-btn ${btnClass}" onclick="durumDegistir(${film.id}, '${film.izlendi}')">
                            <i class="fas fa-check"></i>
                        </button>

                        <button class="delete-btn" onclick="listedenSil(${film.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (error) {
        console.error("Liste yüklenemedi:", error);
    }
}

// --- LİSTEDEN SİLME ---
async function listedenSil(id) {
    // 1. Şık bir onay penceresi aç
    const sonuc = await Swal.fire({
        title: 'Emin misin?',
        text: "Bu filmi listenden silmek üzeresin!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e94560', // Bizim tema kırmızısı
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sil gitsin!',
        cancelButtonText: 'Vazgeç',
        background: '#16213e', // Arka plan (Bizim lacivert)
        color: '#fff' // Yazı rengi beyaz
    });

    // 2. Eğer kullanıcı "Evet" dediyse silme işlemini yap
    if (sonuc.isConfirmed) {
        try {
            const res = await fetch(`${API_URL}/sil/${id}`, { method: "DELETE" });
            
            if (res.ok) {
                // Başarılı olursa yine havalı bir bildirim göster
                bildirimGoster("🗑️ Film başarıyla silindi", "basarili");
                listeyiGetir(); // Listeyi yenile
            } else {
                bildirimGoster("Hata oluştu, silinemedi!", "hata");
            }
        } catch (error) {
            console.error("Silme hatası:", error);
            bildirimGoster("Bağlantı hatası!", "hata");
        }
    }
}

async function detayAc(tmdb_id, tur = 'movie') {
    const modal = document.getElementById("movieModal");
    modal.style.display = "block"; 
    document.getElementById("modalVideo").innerHTML = "Yükleniyor...";

    try {
        const res = await fetch(`${API_URL}/detay/${tmdb_id}?tur=${tur}`);
        const data = await res.json();

        document.getElementById("modalTitle").innerText = data.baslik;
        document.getElementById("modalTagline").innerText = data.tagline || "";
        document.getElementById("modalRating").innerText = `IMDb : ${data.puan.toFixed(1)}`; // Puanı düzelttik
        document.getElementById("modalRuntime").innerText = `🕒 : ${data.sure} dk`;
        document.getElementById("modalOverview").innerText = data.ozet;
        document.getElementById("modalGenres").innerText = data.turler.join(", "); // Türleri virgülle ayır
        document.getElementById("modalDirector").innerText = data.yonetmen;
        document.getElementById("modalCast").innerText = data.oyuncular.join(", ");
        document.getElementById("modalTitle").innerText = data.baslik;
        document.getElementById("modalTagline").innerText = data.tagline || "";

        // --- YENİ KISIM: PLATFORMLARI GÖSTERME ---
        const platformDiv = document.getElementById("modalPlatforms"); // HTML'de bunu birazdan oluşturacağız
        
        if (data.platformlar && data.platformlar.length > 0) {
            let logolarHTML = '<span class="platform-title">📺 Şurada İzle :</span><div class="platform-container">';
            
            data.platformlar.forEach(p => {
                logolarHTML += `<img src="${p.logo}" title="${p.ad}" class="platform-logo" alt="${p.ad}">`;
            });
            
            logolarHTML += '</div>';
            platformDiv.innerHTML = logolarHTML;
        } else {
            platformDiv.innerHTML = '<p style="color:#aaa; font-size:0.9em;">😔 Şu an Türkiye\'de dijital platformlarda yok.</p>';
        }

        const imdbBtn = document.getElementById("modalImdb");
        if (data.imdb_id) {
            imdbBtn.style.display = "inline-block";
            imdbBtn.href = `https://www.imdb.com/title/${data.imdb_id}`;
        } else {
            imdbBtn.style.display = "none";
        }
        // ------------------------------------------

        const videoDiv = document.getElementById("modalVideo");
        if (data.youtube_video) {
            videoDiv.innerHTML = `<iframe src="${data.youtube_video}" allowfullscreen></iframe>`;
        } else if (data.backdrop) {
            videoDiv.innerHTML = `<img src="${data.backdrop}" style="width:100%; border-radius:10px;">`;
        } else {
            videoDiv.innerHTML = "<p style='color:white; text-align:center;'>Görsel yok.</p>";
        }
    } catch (error) {
        console.error("Detay hatası:", error);
    }
}

function modalKapat() {
    document.getElementById("movieModal").style.display = "none";
    document.getElementById("modalVideo").innerHTML = "";
}

// --- LİSTEYE EKLEME ---
async function listeyeEkle(tmdb_id,tur , ad, puan, poster) {
    const filmVerisi = { tmdb_id: tmdb_id, tur: tur, ad: ad, puan: puan, poster: poster };

    try {
        const res = await fetch(`${API_URL}/ekle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(filmVerisi)
        });
        
        if (res.ok) {
            bildirimGoster("✅ " + ad + " listene eklendi!");
            listeyiGetir();
        } else if (res.status === 401) {
            bildirimGoster("⚠️ Önce giriş yapmalısın!", "hata");
        } else {
            bildirimGoster("Bir hata oluştu!", "hata");
        }
    } catch (error) {
        console.error("Ekleme hatası:", error);
    }
}

document.getElementById("searchInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") filmAra();
});

window.onclick = function(event) {
    const modal = document.getElementById("movieModal");
    if (event.target == modal) modalKapat();
};

async function durumDegistir(id, mevcutDurum) {
    const yeniDurum = mevcutDurum === "Evet" ? "Hayır" : "Evet";
    
    try {
        const res = await fetch(`${API_URL}/guncelle/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ izlendi: yeniDurum })
        });

        if (res.ok) {
            if (yeniDurum === "Evet") {
                bildirimGoster("🎉 Film izlendi olarak işaretlendi!", "basarili");
            } else {
                bildirimGoster("İzlenmedi olarak geri alındı.");
            }
            listeyiGetir();
        } else {
            bildirimGoster("Hata oluştu!", "hata");
        }
    } catch (error) {
        console.error("Güncelleme hatası:", error);
    }
}

function menuyuAcKapat() {
    document.getElementById("myDropdown").classList.toggle("show-menu");
}

window.onclick = function(event) {
    if (!event.target.matches('.user-avatar')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show-menu')) {
                openDropdown.classList.remove('show-menu');
            }
        }
    }
    const modal = document.getElementById("movieModal");
    if (event.target == modal) {
        modalKapat();
    }
}