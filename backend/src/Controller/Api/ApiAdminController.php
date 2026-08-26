<?php

namespace App\Controller\Api;

use App\Entity\Resource;
use App\Repository\BreathingExerciceRepository;
use App\Repository\RessourceRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/admin')]
#[IsGranted('ROLE_ADMIN')]
class ApiAdminController extends AbstractController
{
    #[Route('/stats', name: 'api_admin_stats', methods: ['GET'])]
    public function stats(
        UserRepository $userRepo,
        RessourceRepository $resourceRepo,
        BreathingExerciceRepository $exerciceRepo
    ): JsonResponse {
        $allResources = $resourceRepo->findAll();
        $visible = array_filter($allResources, fn ($r) => $r->isVisible());

        return $this->json([
            'usersCount' => count($userRepo->findAll()),
            'resourcesCount' => count($allResources),
            'visibleResourcesCount' => count($visible),
            'exercicesCount' => count($exerciceRepo->findAll()),
        ]);
    }

    #[Route('/resources', name: 'api_admin_resource_list', methods: ['GET'])]
    public function listResources(RessourceRepository $repo): JsonResponse
    {
        $resources = $repo->findBy([], ['createdAt' => 'DESC']);

        return $this->json(array_map(fn ($r) => [
            'id' => $r->getId(),
            'title' => $r->getTitle(),
            'type' => $r->getType(),
            'visible' => $r->isVisible(),
            'createdAt' => $r->getCreatedAt()?->format('Y-m-d'),
            'author' => [
                'id' => $r->getAuthor()->getId(),
                'firstname' => $r->getAuthor()->getFirstname(),
                'lastname' => $r->getAuthor()->getLastname(),
            ],
            'readCount' => $r->getReadByUsers()->count(),
            'favoriteCount' => $r->getFavoritedByUsers()->count(),
        ], $resources));
    }

    #[Route('/resources/{id}/visibility', name: 'api_admin_resource_visibility', methods: ['PATCH'])]
    public function toggleVisibility(Resource $resource, EntityManagerInterface $em): JsonResponse
    {
        $resource->setVisible(!$resource->isVisible());
        $em->flush();

        return $this->json(['id' => $resource->getId(), 'visible' => $resource->isVisible()]);
    }

    #[Route('/breathing-exercices', name: 'api_admin_breathing_list', methods: ['GET'])]
    public function listExercices(BreathingExerciceRepository $repo): JsonResponse
    {
        $exercices = $repo->findBy([], ['createdAt' => 'DESC']);

        return $this->json(array_map(fn ($e) => [
            'id' => $e->getId(),
            'name' => $e->getName(),
            'type' => $e->getType(),
            'duration' => $e->getDuration(),
            'timeInhale' => $e->getTimeInhale(),
            'timeHold' => $e->getTimeHold(),
            'timeExhale' => $e->getTimeExhale(),
            'numberCycle' => $e->getNumberCycle(),
            'createdAt' => $e->getCreatedAt()?->format('Y-m-d'),
            'completedByCount' => $e->getUsers()->count(),
        ], $exercices));
    }
}
