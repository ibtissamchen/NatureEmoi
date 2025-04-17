document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('client');
  if (form) {
      form.addEventListener('submit', (e) => {
          e.preventDefault();
          console.log('Formulaire soumis !');
      });
  } else {
      console.error("Formulaire non trouvé !");
  }
});
const apiUrl = 'http://localhost:3000';

// Fonction to add a category
document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Retrieve the form data
  const nom = document.getElementById('nom').value;
  const description = document.getElementById('description').value;

  try {
      // Send POST request to the API
      const response = await fetch(`${apiUrl}/categories`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nom, description }),
      });

     
      if (response.ok) {
          alert('Catégorie ajoutée avec succès');
          
      } else {
          const errorData = await response.json();
          alert("erreur :" + errorData.error);
      }
  } catch (error) {
      console.error('Erreur :', error);
      alert("impossible de se connecter au serveur !")
  }
});
const apiUrl1 = 'http://localhost:3000/plantes'; // URL of the backend

// Function to retrieve the plants
async function fetchPlants() {
  try {
      const response = await fetch(apiUrl1); // Call the GET route /plants
      const plantes = await response.json(); // Convert the response to JSON

      // Select the HTML element where the plants will be displayed
      const plantsContainer = document.getElementById('plantsContainer');

      // Deletes current content
      plantsContainer.innerHTML = '';

      // Iterate through each plant and create an HTML element
      plantes.forEach(plant => {
          const plantCard = document.createElement('div');
          plantCard.className = 'plant-card';

          plantCard.innerHTML = `
              <h3>${plant.nom}</h3>
              <img src="${plant.photo}" alt="${plant.nom}" style="width: 200px; height: 200px;">
              <p>Prix : ${plant.prix} €</p>
              <p>Quantité en stock : ${plant.quantité_en_stock}</p>
              <p>${plant.description}</p>
          `;

          plantsContainer.appendChild(plantCard);
      });
  } catch (error) {
      console.error('Erreur lors de la récupération des plantes :', error);
  }
}

// Call the function to load the plants when the page loads
window.onload = fetchPlants;

console.log("fichier est bien chargé !");
