# S Bots
projet réalisé pour le concours GamesOnWeb 2026

## équipe
Yohan Ménager
Xiaotong Liu

## principe du jeu
Guidez des robots vers la sortie !
déplacez des obstacles et ouvrez-leur des portes pour qu'ils s'en sortent. ils peuvent également ouvrir leurs propres portes avec des clés, ou déplacer des blocs.

## fonctionnement
Chaque niveau commence en phase de préparation. Il est alors possible d'interagir avec certains éléments du niveau. quand on est prêt, on clique sur le bouton Commencer. Les robots se lancent alors dans le niveau, et réussissent selon qu'on ait correctement préparé le niveau ou non.
Les robots se déplacent avec Recast, qui définit les zones sur lesquelles le déplacement est possible, et définit le chemin optimal.

### pour le joueur
Obstacle : un bloc qui est déplaçable. Il bloque le chemin, forçant les robots à en choisir un autre, ou les empêchant d'avancer.

Porte : assez direct, on peut ouvrir ou fermer un passage.

### pour les robots
Porte : ils peuvent l'ouvrir s'ils ont une clé. Certaines n'en ont pas besoin, et ne servent que d'un point de vue cosmétique... ou pour bloquer les ennemis.

Clé : les robots les prennent pour ouvrir les portes verrouillées.

Bloc : les robots peuvent les pousser jusqu'à un point prédéfini. Ils peuvent alors bloquer le passage.


## problèmes rencontrés pendant le développement
### Havoc
Sans trop réfléchir, nous avions au début intégré le moteur physique Havoc, ce qui était une énorme erreur. Il n'est pas optimisé pour un jeu puzzle de ce type, qui doit être déterministe. Cela a fait perdre beaucoup de temps, pour gérer les problèmes posés. Nous avons au final décidé d'enlever havoc, qui n'apportait pas grand chose au projet de toute façon. Il y avait quand même quelque chose de comique à voir les obstacles partir dans tous les sens quand on tire dessus un peu trop fort.

### un peu trop ambitieux
Au début, nous voulions intégrer une IA plus forte. L'idée était que les robots devraient pouvoir appeler à l'aide, par exemple pour pousser un bloc à plusieurs, ou aller aider d'autres robots. 
On avait aussi l'idée de mettre des personnalités différentes aux robots : par exemple, un robot introverti n'appellerait pas à l'aide, ou selon leur personnalités, ils pourraient aussi choisir entre aller directement vers la sortie ou aider un autre robot.
Malheuresement, nous n'avons pas eu le temps de faire ça.

### imports des modèles 3d
L'import de modèles 3d pour les robots et les ennemis a un peu cassé certaines fonctionnalités, qu'il a fallu reconstruire pour aller avec. Ça n'a pas été critique, mais ça nous a fait perdre une soirée.

### niveaux à plusieurs étages
Nous avions cette idée pour créer des niveaux plus riches, mais recast agit bizarrement quand il s'agit de passer sur une rampe pour changer d'étage. Vu que ça ne fonctionne pas parfaitement bien, nous n'avons pas mis de niveau qui fonctionne là-dessus.

## Lien avec le thème IA
Ce jeu correspond au thème IA car il s'agit de robots gentils qui doivent échapper à des robots méchants. De plus, le jeu joue sur une mécanique d'intelligence artificielle, puisque ce sont les robots qui agissent, conformément à leur programmation, pas le joueur.

## pourquoi ce jeu ?
Nous avons choisis de faire ce jeu pour faire quelque chose d'abordable pour n'importe quel joueur, là où un jeu plus orienté "actions du joueur" pourrait poser problème. De plus, c'est un jeu simple, mais où beaucoup d'évolutions sont possibles, par exemple en améliorant l'IA des robots ou des ennemis ou en ajoutant de nouveaux objets avec lesquels interagir. Ainsi, nous pouvions à la fois rendre quelque chose de valide si nous manquions de temps, ou améliorer l'existant si on est en avance.